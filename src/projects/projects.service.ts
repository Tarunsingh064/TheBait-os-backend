import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Project, ProjectDocument } from '../schemas/project.schema';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { scopeToTenant } from '../tenants/tenant-scope.util';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectModel(Project.name) private projectModel: Model<ProjectDocument>,
    private notificationsService: NotificationsService,
  ) {}

  async create(user: AuthenticatedUser, dto: CreateProjectDto) {
    const { agencyId } = scopeToTenant(user);
    return this.projectModel.create({
      agencyId,
      clientId: dto.clientId ? new Types.ObjectId(dto.clientId) : null,
      name: dto.name,
      description: dto.description ?? '',
      deadline: dto.deadline ? new Date(dto.deadline) : null,
      createdBy: new Types.ObjectId(user.userId),
    });
  }

  async findAll(user: AuthenticatedUser) {
    const { agencyId } = scopeToTenant(user);
    const filter: Record<string, unknown> = { agencyId };
    // A client only ever sees projects explicitly tied to them, never an
    // agency's full internal project list.
    if (user.role === 'client') filter.clientId = new Types.ObjectId(user.userId);
    return this.projectModel.find(filter).sort({ deadline: 1, createdAt: -1 }).lean();
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const { agencyId } = scopeToTenant(user);
    const project = await this.projectModel.findOne({ _id: id, agencyId }).lean();
    if (!project) throw new NotFoundException('Project not found');
    if (user.role === 'client' && (!project.clientId || project.clientId.toString() !== user.userId)) {
      throw new ForbiddenException('This project does not belong to you');
    }
    return project;
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateProjectDto) {
    const { agencyId } = scopeToTenant(user);
    const project = await this.projectModel.findOne({ _id: id, agencyId });
    if (!project) throw new NotFoundException('Project not found');

    const statusChanged = dto.status !== undefined && dto.status !== project.status;
    const deadlineChanged = dto.deadline !== undefined;

    if (dto.name !== undefined) project.name = dto.name;
    if (dto.description !== undefined) project.description = dto.description;
    if (dto.status !== undefined) project.status = dto.status as Project['status'];
    if (dto.deadline !== undefined) project.deadline = dto.deadline ? new Date(dto.deadline) : null;

    await project.save();

    // Fire-and-forget: a notification failure should never block the actual
    // project update from succeeding.
    if ((statusChanged || deadlineChanged) && project.clientId) {
      this.notificationsService
        .create({
          agencyId,
          recipientId: project.clientId,
          type: 'project_updated',
          message: `Project "${project.name}" was updated${statusChanged ? ` — now ${project.status.replace('_', ' ')}` : ''}.`,
          relatedEntityId: project._id,
        })
        .catch(() => undefined);
    }

    return project;
  }

  async remove(user: AuthenticatedUser, id: string) {
    const { agencyId } = scopeToTenant(user);
    const result = await this.projectModel.deleteOne({ _id: id, agencyId });
    if (result.deletedCount === 0) throw new NotFoundException('Project not found');
    return { deleted: true };
  }
}
