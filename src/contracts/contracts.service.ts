import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PDFDocument, StandardFonts, rgb, PDFFont } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';
import * as fontkit from '@pdf-lib/fontkit';
import { Contract, ContractDocument } from '../schemas/contract.schema';
import { Agency, AgencyDocument } from '../schemas/agency.schema';
import { User, UserDocument } from '../schemas/user.schema';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { scopeToTenant } from '../tenants/tenant-scope.util';
import { CreateContractDto } from './dto/create-contract.dto';
import { SignContractDto } from './dto/sign-contract.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { CloudinaryService } from '../uploads/Cloudinary.service';

@Injectable()
export class ContractsService {
  constructor(
    @InjectModel(Contract.name) private contractModel: Model<ContractDocument>,
    @InjectModel(Agency.name) private agencyModel: Model<AgencyDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private notificationsService: NotificationsService,
    private cloudinaryService: CloudinaryService,
  ) {}

  /**
   * Sensible starting text for the standard legal clauses — an agency owner
   * shouldn't stare at a blank "Force Majeure" field with no idea what
   * belongs there. Every clause remains fully editable per contract; this
   * is NOT a substitute for real legal review on anything high-stakes.
   */
  private defaultClauses(agencyName: string) {
    return {
      confidentiality:
        `Each party agrees to keep confidential all non-public information disclosed by the other party in connection with this agreement, and not to use or disclose such information except as necessary to perform its obligations under this agreement.`,
      intellectualProperty:
        `Upon full payment, all work product, designs, code, documents, and other deliverables created by ${agencyName} specifically for the client under this agreement shall become the property of the client. ${agencyName} retains ownership of any pre-existing tools, frameworks, or materials not created specifically for this engagement.`,
      warranties:
        `Each party represents that it has the full right and authority to enter into this agreement and to perform its obligations under it.`,
      liability:
        `Neither party shall be liable to the other for any indirect, incidental, or consequential damages arising out of this agreement. Each party's total liability under this agreement shall not exceed the total fees paid or payable under it.`,
      disputeResolution:
        `The parties shall first attempt to resolve any dispute arising out of this agreement through good-faith negotiation. If unresolved, the dispute shall be settled through mediation, and if still unresolved, through binding arbitration or the courts of the applicable jurisdiction.`,
      forceMajeure:
        `Neither party shall be held responsible for any delay or failure to perform its obligations under this agreement due to causes beyond its reasonable control, including natural disasters, war, civil unrest, or pandemics.`,
      amendments:
        `This agreement may only be amended or modified by a written document signed by both parties.`,
      entireAgreement:
        `This agreement constitutes the entire understanding between the parties with respect to its subject matter and supersedes all prior discussions, agreements, or representations, whether written or oral.`,
    };
  }

  async create(user: AuthenticatedUser, dto: CreateContractDto) {
    const { agencyId } = scopeToTenant(user);

    const agency = await this.agencyModel.findById(agencyId).lean();
    if (!agency) throw new NotFoundException('Agency not found');

    const client = await this.userModel.findOne({ _id: dto.clientId, agencyId }).lean();
    if (!client) throw new NotFoundException('Client not found');

    const defaults = this.defaultClauses(agency.name);

    const partyA = {
      legalName: dto.partyAOverride?.legalName ?? agency.name,
      address: dto.partyAOverride?.address ?? agency.address ?? '',
      email: dto.partyAOverride?.email ?? agency.contactEmail ?? '',
      phone: dto.partyAOverride?.phone ?? agency.contactPhone ?? '',
    };

    const partyB = {
      legalName: dto.partyBOverride?.legalName ?? client.name,
      address: dto.partyBOverride?.address ?? '',
      email: dto.partyBOverride?.email ?? client.email,
      phone: dto.partyBOverride?.phone ?? '',
    };

    const contract = await this.contractModel.create({
      agencyId,
      clientId: new Types.ObjectId(dto.clientId),
      title: dto.title,
      partyA,
      partyB,
      effectiveDate: new Date(dto.effectiveDate),
      scopeOfWork: dto.scopeOfWork ?? '',
      payment: {
        rateType: dto.payment?.rateType ?? 'fixed',
        amountMinor: dto.payment?.amountMinor ?? 0,
        currency: dto.payment?.currency ?? 'INR',
        schedule: dto.payment?.schedule ?? '',
        acceptedMethods: dto.payment?.acceptedMethods ?? '',
        latePenalty: dto.payment?.latePenalty ?? '',
      },
      duration: {
        startDate: dto.duration?.startDate ? new Date(dto.duration.startDate) : null,
        endDate: dto.duration?.endDate ? new Date(dto.duration.endDate) : null,
        terminationConditions: dto.duration?.terminationConditions ?? '',
        noticePeriod: dto.duration?.noticePeriod ?? '',
      },
      confidentiality: dto.confidentiality ?? defaults.confidentiality,
      intellectualProperty: dto.intellectualProperty ?? defaults.intellectualProperty,
      responsibilities: dto.responsibilities ?? '',
      warranties: dto.warranties ?? defaults.warranties,
      liability: dto.liability ?? defaults.liability,
      disputeResolution: dto.disputeResolution ?? defaults.disputeResolution,
      governingLaw: dto.governingLaw ?? '',
      forceMajeure: dto.forceMajeure ?? defaults.forceMajeure,
      amendments: dto.amendments ?? defaults.amendments,
      entireAgreement: dto.entireAgreement ?? defaults.entireAgreement,
      status: 'draft',
    });

    return contract;
  }

  async findAll(user: AuthenticatedUser) {
    const { agencyId } = scopeToTenant(user);
    const filter: Record<string, unknown> = { agencyId };
    if (user.role === 'client') {
      filter.clientId = new Types.ObjectId(user.userId);
      filter.status = { $ne: 'draft' };
    }
    return this.contractModel.find(filter).sort({ createdAt: -1 }).lean();
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const { agencyId } = scopeToTenant(user);
    const contract = await this.contractModel.findOne({ _id: id, agencyId }).lean();
    if (!contract) throw new NotFoundException('Contract not found');
    if (user.role === 'client') {
      if (contract.clientId.toString() !== user.userId) {
        throw new ForbiddenException('This contract does not belong to you');
      }
      if (contract.status === 'draft') {
        throw new ForbiddenException('This contract has not been sent yet');
      }
    }
    return contract;
  }

  async send(user: AuthenticatedUser, id: string) {
    const contract = await this.findOne(user, id);
    if (contract.status !== 'draft') {
      throw new ForbiddenException('Only draft contracts can be sent');
    }
    await this.contractModel.updateOne({ _id: id }, { status: 'sent', sentAt: new Date() });

    this.notificationsService
      .create({
        agencyId: contract.agencyId,
        recipientId: contract.clientId,
        type: 'contract_sent',
        message: `A contract ("${contract.title}") is ready for your signature.`,
        relatedEntityId: contract._id,
      })
      .catch(() => undefined);

    return this.findOne(user, id);
  }

  /**
   * Only the client the contract belongs to can sign it — checked inside
   * findOne above. IP is captured for a minimal audit trail; the uploaded
   * signature image (if any) goes through the same CloudinaryService used
   * for agency logos. Neither this typed-name signature nor the image is a
   * substitute for a real e-sign provider if legal enforceability matters.
   */
  async sign(
    user: AuthenticatedUser,
    id: string,
    dto: SignContractDto,
    ip: string,
    signatureFile?: { buffer: Buffer; mimetype: string },
  ) {
    const contract = await this.findOne(user, id);
    if (user.role !== 'client') {
      throw new ForbiddenException('Only the client can sign this contract');
    }
    if (contract.status !== 'sent') {
      throw new ForbiddenException('This contract is not awaiting signature');
    }

    let signatureImageUrl: string | null = null;
    if (signatureFile) {
      signatureImageUrl = await this.cloudinaryService.uploadImage(
        signatureFile.buffer,
        signatureFile.mimetype,
        'signatures',
      );
    }

    await this.contractModel.updateOne(
      { _id: id },
      {
        status: 'signed',
        signedByName: dto.fullName,
        signedAt: new Date(),
        signedFromIp: ip,
        signatureImageUrl,
        witnessName: dto.witnessName ?? null,
      },
    );

    const agency = await this.agencyModel.findById(contract.agencyId).lean();
    if (agency) {
      this.notificationsService
        .create({
          agencyId: contract.agencyId,
          recipientId: agency.ownerId,
          type: 'contract_signed',
          message: `${dto.fullName} signed the contract "${contract.title}".`,
          relatedEntityId: contract._id,
        })
        .catch(() => undefined);
    }

    return this.findOne(user, id);
  }

  async remove(user: AuthenticatedUser, id: string) {
    const { agencyId } = scopeToTenant(user);
    const contract = await this.contractModel.findOne({ _id: id, agencyId });
    if (!contract) throw new NotFoundException('Contract not found');
    if (contract.status === 'signed') {
      throw new ForbiddenException('A signed contract is a legal record and cannot be deleted');
    }
    await contract.deleteOne();
    return { deleted: true };
  }

  /**
   * Full contract PDF covering every requested section: title, both
   * parties, effective date, scope of work, payment terms, duration &
   * termination, confidentiality, IP, responsibilities, warranties,
   * liability, dispute resolution + governing law, force majeure,
   * amendments, entire agreement, and signatures (typed name + uploaded
   * signature image + date + witness, if any).
   */
  async generatePdf(user: AuthenticatedUser, id: string): Promise<Buffer> {
    const contract = await this.findOne(user, id);

    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit); // <-- REQUIRED FOR UNICODE FONTS

    // Load Unicode-capable font that includes the ₹ glyph.
    // Place NotoSans-Regular.ttf under src/assets/fonts/
    // and make sure your build copies it into dist/ (nest-cli.json "assets").
    const regularBytes = fs.readFileSync(path.join(__dirname, '../assets/fonts/NotoSans-Regular.ttf'));
    const font = await pdfDoc.embedFont(regularBytes);
    // Using the same Regular weight for "bold" for now. To get true bold,
    // add NotoSans-Bold.ttf to your assets folder and embed it as well.
    const bold = await pdfDoc.embedFont(regularBytes);

    let page = pdfDoc.addPage([595, 842]); // A4
    const margin = 48;
    const pageWidth = 595;
    let y = 842 - margin;

    const newPageIfNeeded = (minSpace: number) => {
      if (y < margin + minSpace) {
        page = pdfDoc.addPage([595, 842]);
        y = 842 - margin;
      }
    };

    const drawText = (text: string, x: number, size: number, f: PDFFont, color = rgb(0.1, 0.11, 0.13)) => {
      page.drawText(text, { x, y, size, font: f, color });
    };

    // ---- Title ----
    drawText(contract.title, margin, 20, bold);
    y -= 30;

    // ---- Parties Involved ----
    const heading = (text: string) => {
      newPageIfNeeded(60);
      y -= 6;
      drawText(text, margin, 11, bold, rgb(0.1, 0.11, 0.13));
      y -= 16;
    };

    const paragraph = (text: string) => {
      if (!text) return;
      for (const line of this.wrapText(text, font, 9.5, pageWidth - margin * 2)) {
        newPageIfNeeded(30);
        drawText(line, margin, 9.5, font, rgb(0.2, 0.22, 0.26));
        y -= 14;
      }
      y -= 8;
    };

    heading('Parties');
    paragraph(
      `Party A: ${contract.partyA.legalName}${contract.partyA.address ? `, ${contract.partyA.address}` : ''} (${[contract.partyA.email, contract.partyA.phone].filter(Boolean).join(', ')})`,
    );
    paragraph(
      `Party B: ${contract.partyB.legalName}${contract.partyB.address ? `, ${contract.partyB.address}` : ''} (${[contract.partyB.email, contract.partyB.phone].filter(Boolean).join(', ')})`,
    );

    // ---- Effective Date ----
    heading('Effective date');
    paragraph(new Date(contract.effectiveDate).toLocaleDateString());

    // ---- Purpose / Scope of Work ----
    if (contract.scopeOfWork) {
      heading('Purpose / scope of work');
      paragraph(contract.scopeOfWork);
    }

    // ---- Payment Terms ----
    heading('Payment terms');
    const money = (minor: number, currency: string) =>
      new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(minor / 100);
    const rateLabel =
      contract.payment.rateType === 'hourly'
        ? 'per hour'
        : contract.payment.rateType === 'monthly'
          ? 'per month'
          : 'total';
    paragraph(`Amount: ${money(contract.payment.amountMinor, contract.payment.currency)} (${rateLabel})`);
    if (contract.payment.schedule) paragraph(`Schedule: ${contract.payment.schedule}`);
    if (contract.payment.acceptedMethods) paragraph(`Accepted methods: ${contract.payment.acceptedMethods}`);
    if (contract.payment.latePenalty) paragraph(`Late payment penalty: ${contract.payment.latePenalty}`);

    // ---- Duration and Termination ----
    heading('Duration and termination');
    if (contract.duration.startDate || contract.duration.endDate) {
      paragraph(
        `Term: ${contract.duration.startDate ? new Date(contract.duration.startDate).toLocaleDateString() : 'N/A'} to ${contract.duration.endDate ? new Date(contract.duration.endDate).toLocaleDateString() : 'ongoing'}`,
      );
    }
    if (contract.duration.terminationConditions) paragraph(contract.duration.terminationConditions);
    if (contract.duration.noticePeriod) paragraph(`Notice period: ${contract.duration.noticePeriod}`);

    // ---- Confidentiality ----
    heading('Confidentiality');
    paragraph(contract.confidentiality);

    // ---- Intellectual Property ----
    heading('Intellectual property');
    paragraph(contract.intellectualProperty);

    // ---- Responsibilities ----
    if (contract.responsibilities) {
      heading('Responsibilities of each party');
      paragraph(contract.responsibilities);
    }

    // ---- Warranties and Representations ----
    heading('Warranties and representations');
    paragraph(contract.warranties);

    // ---- Liability and Indemnification ----
    heading('Liability and indemnification');
    paragraph(contract.liability);

    // ---- Dispute Resolution ----
    heading('Dispute resolution');
    paragraph(contract.disputeResolution);
    if (contract.governingLaw) paragraph(`Governing law: ${contract.governingLaw}`);

    // ---- Force Majeure ----
    heading('Force majeure');
    paragraph(contract.forceMajeure);

    // ---- Amendments ----
    heading('Amendments');
    paragraph(contract.amendments);

    // ---- Entire Agreement ----
    heading('Entire agreement');
    paragraph(contract.entireAgreement);

    // ---- Signatures ----
    newPageIfNeeded(180);
    heading('Signatures');

    if (contract.status === 'signed' && contract.signedByName) {
      paragraph(`Signed by: ${contract.signedByName}`);
      paragraph(`Date: ${contract.signedAt ? new Date(contract.signedAt).toLocaleString() : ''}`);

      if (contract.signatureImageUrl) {
        try {
          const imgResponse = await fetch(contract.signatureImageUrl);
          const imgBytes = await imgResponse.arrayBuffer();
          const isPng = contract.signatureImageUrl.toLowerCase().includes('.png');
          const image = isPng
            ? await pdfDoc.embedPng(imgBytes)
            : await pdfDoc.embedJpg(imgBytes);
          const imgDims = image.scaleToFit(160, 60);
          newPageIfNeeded(80);
          page.drawImage(image, { x: margin, y: y - imgDims.height, width: imgDims.width, height: imgDims.height });
          y -= imgDims.height + 10;
        } catch {
          // If the signature image can't be fetched/embedded (network hiccup,
          // unsupported format), the PDF still generates with the typed name —
          // never fail the whole download over a missing image.
        }
      }

      if (contract.witnessName) {
        paragraph(`Witness: ${contract.witnessName}`);
      }
    } else {
      paragraph('Not yet signed.');
    }

    const bytes = await pdfDoc.save();
    return Buffer.from(bytes);
  }

  private wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const trial = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(trial, size) > maxWidth) {
        if (current) lines.push(current);
        current = word;
      } else {
        current = trial;
      }
    }
    if (current) lines.push(current);
    return lines;
  }
}