import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Task, TaskDocument } from '../schemas/task.schema';
import { User, UserDocument, STAFF_ROLES } from '../schemas/user.schema';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { scopeToTenant } from '../tenants/tenant-scope.util';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class TasksService {
  constructor(
    @InjectModel(Task.name) private taskModel: Model<TaskDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private notificationsService: NotificationsService,
  ) {}

  private async assertAssignableStaff(agencyId: Types.ObjectId, assigneeId: string) {
    const assignee = await this.userModel.findOne({ _id: assigneeId, agencyId });
    if (!assignee || !STAFF_ROLES.includes(assignee.role)) {
      throw new BadRequestException('Tasks can only be assigned to agency staff, not clients');
    }
  }

  async create(user: AuthenticatedUser, dto: CreateTaskDto) {
    const { agencyId } = scopeToTenant(user);

    if (dto.assigneeId) await this.assertAssignableStaff(agencyId, dto.assigneeId);

    const task = await this.taskModel.create({
      agencyId,
      projectId: dto.projectId ? new Types.ObjectId(dto.projectId) : null,
      teamId: dto.teamId ? new Types.ObjectId(dto.teamId) : null,
      title: dto.title,
      description: dto.description ?? '',
      priority: dto.priority ?? 'medium',
      assigneeId: dto.assigneeId ? new Types.ObjectId(dto.assigneeId) : null,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
      createdBy: new Types.ObjectId(user.userId),
    });

    if (task.assigneeId) {
      this.notificationsService
        .create({
          agencyId,
          recipientId: task.assigneeId,
          type: 'task_assigned',
          message: `You've been assigned to "${task.title}".`,
          relatedEntityId: task._id,
        })
        .catch(() => undefined);
    }

    return task;
  }

  /**
   * Supports optional filters so the frontend can render either a full
   * agency-wide board, a single project's board, a single team's board, or
   * "my tasks" (assigneeId = the current user) — same endpoint, different
   * query params, one Notion-like board component on the frontend.
   */
  async findAll(user: AuthenticatedUser, filters: { projectId?: string; teamId?: string; assigneeId?: string }) {
    const { agencyId } = scopeToTenant(user);
    const query: Record<string, unknown> = { agencyId };
    if (filters.projectId) query.projectId = new Types.ObjectId(filters.projectId);
    if (filters.teamId) query.teamId = new Types.ObjectId(filters.teamId);
    if (filters.assigneeId) query.assigneeId = new Types.ObjectId(filters.assigneeId);
    return this.taskModel.find(query).sort({ createdAt: -1 }).lean();
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const { agencyId } = scopeToTenant(user);
    const task = await this.taskModel.findOne({ _id: id, agencyId }).lean();
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateTaskDto) {
    const { agencyId } = scopeToTenant(user);
    const task = await this.taskModel.findOne({ _id: id, agencyId });
    if (!task) throw new NotFoundException('Task not found');

    const previousAssigneeId = task.assigneeId?.toString() ?? null;

    if (dto.assigneeId !== undefined) {
      if (dto.assigneeId) await this.assertAssignableStaff(agencyId, dto.assigneeId);
      task.assigneeId = dto.assigneeId ? new Types.ObjectId(dto.assigneeId) : null;
    }
    if (dto.title !== undefined) task.title = dto.title;
    if (dto.description !== undefined) task.description = dto.description;
    if (dto.status !== undefined) task.status = dto.status as Task['status'];
    if (dto.priority !== undefined) task.priority = dto.priority as Task['priority'];
    if (dto.dueDate !== undefined) task.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;

    await task.save();

    // Only notify when the assignee actually CHANGED to someone new — not
    // on every unrelated field edit, and not if it was cleared to unassigned.
    const newAssigneeId = task.assigneeId?.toString() ?? null;
    if (newAssigneeId && newAssigneeId !== previousAssigneeId) {
      this.notificationsService
        .create({
          agencyId,
          recipientId: task.assigneeId as Types.ObjectId,
          type: 'task_assigned',
          message: `You've been assigned to "${task.title}".`,
          relatedEntityId: task._id,
        })
        .catch(() => undefined);
    }

    return task;
  }

  async remove(user: AuthenticatedUser, id: string) {
    const { agencyId } = scopeToTenant(user);
    const result = await this.taskModel.deleteOne({ _id: id, agencyId });
    if (result.deletedCount === 0) throw new NotFoundException('Task not found');
    return { deleted: true };
  }
}
