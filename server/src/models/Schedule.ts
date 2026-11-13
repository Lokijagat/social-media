import { type InferSchemaType, Schema, model } from 'mongoose'
import { PLATFORMS } from './constants.js'

/** One publish job: one post variant to one platform at one time. Picked up by the publish worker. */
const scheduleSchema = new Schema(
  {
    store: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    post: { type: Schema.Types.ObjectId, ref: 'Post', required: true, index: true },
    variant: { type: Schema.Types.ObjectId, ref: 'PostVariant', required: true },
    platform: { type: String, enum: PLATFORMS, required: true },
    runAt: { type: Date, required: true },
    status: { type: String, enum: ['pending', 'running', 'done', 'failed', 'cancelled'], default: 'pending' },
    attempts: { type: Number, default: 0 },
    lockedUntil: Date, // simple lock so two workers don't publish the same job
    lastError: String,
    result: { platformPostId: String, permalink: String, publishedAt: Date },
  },
  { timestamps: true },
)

scheduleSchema.index({ status: 1, runAt: 1 })

export type ScheduleDoc = InferSchemaType<typeof scheduleSchema>
export const Schedule = model('Schedule', scheduleSchema)
