import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Meeting, MeetingDocument } from '../schemas/meeting.schema';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { scopeToTenant } from '../tenants/tenant-scope.util';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { HuggingFaceService } from './huggingface.service';

@Injectable()
export class MeetingsService {
  private readonly logger = new Logger(MeetingsService.name);

  constructor(
    @InjectModel(Meeting.name) private meetingModel: Model<MeetingDocument>,
    private huggingFaceService: HuggingFaceService,
  ) {}

  async create(user: AuthenticatedUser, dto: CreateMeetingDto) {
    const { agencyId } = scopeToTenant(user);

    const meeting = await this.meetingModel.create({
      agencyId,
      clientId: dto.clientId ? new Types.ObjectId(dto.clientId) : null,
      title: dto.title,
      transcript: dto.transcript,
      status: 'pending',
    });

    // Fire-and-forget: the client gets an immediate response with status
    // "pending" and polls/refetches for the summary rather than the request
    // blocking on an LLM call, which can take several seconds.
    this.processSummary(meeting._id.toString(), dto.transcript).catch((err) => {
      this.logger.error(`Background summarization failed for ${meeting._id}: ${err}`);
    });

    return meeting;
  }

  private async processSummary(meetingId: string, transcript: string) {
    await this.meetingModel.updateOne({ _id: meetingId }, { status: 'processing' });
    try {
      const result = await this.huggingFaceService.summarizeTranscript(transcript);
      await this.meetingModel.updateOne(
        { _id: meetingId },
        {
          status: 'completed',
          summaryOverview: result.overview,
          decisions: result.decisions,
          actionItems: result.actionItems,
        },
      );
    } catch (err) {
      await this.meetingModel.updateOne(
        { _id: meetingId },
        { status: 'failed', failureReason: (err as Error).message },
      );
    }
  }

  async retry(user: AuthenticatedUser, id: string) {
    const meeting = await this.findOne(user, id);
    if (meeting.status !== 'failed') return meeting;
    this.processSummary(id, meeting.transcript).catch((err) =>
      this.logger.error(`Retry failed for ${id}: ${err}`),
    );
    return this.meetingModel.findByIdAndUpdate(id, { status: 'processing' }, { new: true }).lean();
  }

  async findAll(user: AuthenticatedUser) {
    const { agencyId } = scopeToTenant(user);
    const filter: Record<string, unknown> = { agencyId };
    if (user.role === 'client') filter.clientId = new Types.ObjectId(user.userId);
    return this.meetingModel.find(filter).sort({ createdAt: -1 }).lean();
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const { agencyId } = scopeToTenant(user);
    const meeting = await this.meetingModel.findOne({ _id: id, agencyId }).lean();
    if (!meeting) throw new NotFoundException('Meeting not found');
    return meeting;
  }
}
