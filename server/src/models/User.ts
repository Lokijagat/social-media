import { type InferSchemaType, Schema, model } from 'mongoose'
import { ROLES } from './constants.js'

const membershipSchema = new Schema(
  {
    store: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    role: { type: String, enum: ROLES, required: true },
  },
  { _id: false },
)

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    passwordHash: { type: String, select: false },
    isSuperAdmin: { type: Boolean, default: false }, // platform operator (us), sees all stores
    memberships: { type: [membershipSchema], default: [] },
    whatsappNumber: String, // for approval alerts (phase 2)
    lastLoginAt: Date,
    // Bumped on password change / logout-all; sessions carrying an older value are rejected.
    tokenVersion: { type: Number, default: 0 },
  },
  { timestamps: true },
)

export type UserDoc = InferSchemaType<typeof userSchema>
export const User = model('User', userSchema)
