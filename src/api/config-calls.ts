// The configuration calls of the supervisor actions (specification, API-szerződés: the configuration endpoints), as
// the outbox stores and sends them (sync/outbox.ts): method, path, body, their schemas, and the local records each
// changes. A create always carries the id the app generated, so a repeated one is recognised (M5-02).
import type {
  CheckpointCreateRequest,
  CheckpointUpdateRequest,
  MediaUploadRequest,
  ReportSubscriptionCreateRequest,
  ReportSubscriptionUpdateRequest,
  RouteCreateRequest,
  RouteUpdateRequest,
  RouteVersionCreateRequest,
  ScheduleCreateRequest,
  ScheduleUpdateRequest,
  SchemaPath,
  SiteCreateRequest,
  SiteUpdateRequest,
  SiteUserAttachRequest,
  UserCreateRequest,
  UserPinRequest,
  UserUpdateRequest,
} from '@waypost/schema';

/** The response schemas of the configuration writes: their records are stored when the call succeeds. */
export type ConfigResponseSchema =
  | 'api/site.response'
  | 'api/user.response'
  | 'api/checkpoint.response'
  | 'api/route.response'
  | 'api/route-version.response'
  | 'api/schedule.response'
  | 'api/report-subscription.response'
  | 'api/media-upload.response'
  | 'api/deleted.response';

export interface ConfigCall {
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Below the base URL, e.g. "/checkpoints/0192…". */
  path: string;
  body?: object;
  bodySchema?: SchemaPath;
  responseSchema: ConfigResponseSchema;
  /** IDs of the local records the call changes (a site_user change: the user's). */
  recordIds: string[];
  /** A multipart upload: body holds its text fields, and the file is the photo of this media ID (photo/files.ts). */
  mediaId?: string;
  /**
   * Fields of the body kept out of the database (a new supervisor's password): in the secure store until the call is
   * done, added to the body when it is sent (sync/outbox-secrets.ts). Queued with queueActionWithSecrets only.
   */
  secrets?: Record<string, string>;
}

type WithId<T> = T & { id: string };

const create = (path: string, body: { id: string }, bodySchema: SchemaPath, responseSchema: ConfigResponseSchema): ConfigCall => ({
  method: 'POST',
  path,
  body,
  bodySchema,
  responseSchema,
  recordIds: [body.id],
});

const update = (path: string, id: string, body: object, bodySchema: SchemaPath, responseSchema: ConfigResponseSchema): ConfigCall => ({
  method: 'PATCH',
  path: `${path}/${id}`,
  body,
  bodySchema,
  responseSchema,
  recordIds: [id],
});

const remove = (path: string, id: string): ConfigCall => ({
  method: 'DELETE',
  path: `${path}/${id}`,
  responseSchema: 'api/deleted.response',
  recordIds: [id],
});

export const configCalls = {
  /** Supervisor token only: the site phone cannot create a site. */
  createSite: (body: WithId<SiteCreateRequest>) => create('/sites', body, 'api/site-create.request', 'api/site.response'),
  updateSite: (id: string, body: SiteUpdateRequest) => update('/sites', id, body, 'api/site-update.request', 'api/site.response'),
  deleteSite: (id: string) => remove('/sites', id),

  /** The user gets a new PIN; already assigned: nothing changes. */
  attachSiteUser: (siteId: string, body: SiteUserAttachRequest): ConfigCall => ({
    method: 'POST',
    path: `/sites/${siteId}/users`,
    body,
    bodySchema: 'api/site-user-attach.request',
    responseSchema: 'api/user.response',
    recordIds: [body.user_id],
  }),
  detachSiteUser: (siteId: string, userId: string): ConfigCall => ({
    method: 'DELETE',
    path: `/sites/${siteId}/users/${userId}`,
    responseSchema: 'api/deleted.response',
    recordIds: [userId],
  }),

  /**
   * With the PIN the app generated: a repeated create does not return a PIN the server generated (M5-02). A
   * supervisor's password is a secret field of the call (FR-012).
   */
  createUser: ({ password, ...body }: WithId<UserCreateRequest>): ConfigCall => ({
    ...create('/users', body, 'api/user-create.request', 'api/user.response'),
    ...(password !== undefined && { secrets: { password } }),
  }),
  updateUser: (id: string, body: UserUpdateRequest) => update('/users', id, body, 'api/user-update.request', 'api/user.response'),
  setUserPin: (id: string, body: UserPinRequest): ConfigCall => ({
    method: 'PUT',
    path: `/users/${id}/pin`,
    body,
    bodySchema: 'api/user-pin.request',
    responseSchema: 'api/user.response',
    recordIds: [id],
  }),
  deleteUser: (id: string) => remove('/users', id),

  createCheckpoint: (body: WithId<CheckpointCreateRequest>) =>
    create('/checkpoints', body, 'api/checkpoint-create.request', 'api/checkpoint.response'),
  updateCheckpoint: (id: string, body: CheckpointUpdateRequest) =>
    update('/checkpoints', id, body, 'api/checkpoint-update.request', 'api/checkpoint.response'),
  deleteCheckpoint: (id: string) => remove('/checkpoints', id),
  /** The photo of a checkpoint, before the checkpoint call that refers to it (photo_media_id): it need not exist yet. */
  uploadCheckpointPhoto: (mediaId: string, body: MediaUploadRequest & { owner_type: 'checkpoint' }): ConfigCall => ({
    method: 'PUT',
    path: `/media/${mediaId}`,
    body,
    bodySchema: 'api/media-upload.request',
    responseSchema: 'api/media-upload.response',
    recordIds: [mediaId],
    mediaId,
  }),

  createRoute: (body: WithId<RouteCreateRequest>) => create('/routes', body, 'api/route-create.request', 'api/route.response'),
  updateRoute: (id: string, body: RouteUpdateRequest) => update('/routes', id, body, 'api/route-update.request', 'api/route.response'),
  deleteRoute: (id: string) => remove('/routes', id),

  /** The new version becomes the route's current one, so the route is changed too. */
  createRouteVersion: (routeId: string, body: WithId<RouteVersionCreateRequest>): ConfigCall => ({
    ...create(`/routes/${routeId}/versions`, body, 'api/route-version-create.request', 'api/route-version.response'),
    recordIds: [body.id, routeId],
  }),

  createSchedule: (body: WithId<ScheduleCreateRequest>) =>
    create('/schedules', body, 'api/schedule-create.request', 'api/schedule.response'),
  updateSchedule: (id: string, body: ScheduleUpdateRequest) =>
    update('/schedules', id, body, 'api/schedule-update.request', 'api/schedule.response'),
  deleteSchedule: (id: string) => remove('/schedules', id),

  createReportSubscription: (body: WithId<ReportSubscriptionCreateRequest>) =>
    create('/report-subscriptions', body, 'api/report-subscription-create.request', 'api/report-subscription.response'),
  updateReportSubscription: (id: string, body: ReportSubscriptionUpdateRequest) =>
    update('/report-subscriptions', id, body, 'api/report-subscription-update.request', 'api/report-subscription.response'),
  deleteReportSubscription: (id: string) => remove('/report-subscriptions', id),
} satisfies Record<string, (...args: never[]) => ConfigCall>;
