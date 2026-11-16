import mongoose from 'mongoose';
import crypto from 'node:crypto';

function generateRecordingId() {
  return `rec-${crypto.randomBytes(6).toString('hex')}`;
}

const recordingSchema = new mongoose.Schema(
  {
    recordingId: {
      type: String,
      required: [true, 'Recording ID is required.'],
      unique: true,
      trim: true,
      default: generateRecordingId,
    },
    meeting: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Meeting',
      required: [true, 'Associated meeting reference is required.'],
    },
    meetingId: {
      type: String,
      required: [true, 'Meeting ID is required.'],
      trim: true,
      lowercase: true,
    },
    roomName: {
      type: String,
      required: [true, 'LiveKit room name is required.'],
      trim: true,
    },
    egressId: {
      type: String,
      trim: true,
      default: null,
    },
    initiatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Initiating user is required.'],
    },
    status: {
      type: String,
      enum: {
        values: ['starting', 'recording', 'stopping', 'completed', 'failed'],
        message: 'Invalid recording status. Allowed: starting, recording, stopping, completed, failed.',
      },
      default: 'starting',
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    endedAt: {
      type: Date,
      default: null,
    },
    duration: {
      type: Number,
      default: 0,
      min: [0, 'Duration cannot be negative.'],
    },
    outputFormat: {
      type: String,
      default: 'mp4',
      trim: true,
    },
    storageLocation: {
      type: String,
      enum: ['local', 's3'],
      default: 'local',
    },
    storageKey: {
      type: String,
      trim: true,
      default: '',
    },
    fileName: {
      type: String,
      trim: true,
      default: '',
    },
    fileSize: {
      type: Number,
      default: 0,
      min: [0, 'File size cannot be negative.'],
    },
    error: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        // Strip internal MongoDB id and internal server file paths from user-facing responses
        delete ret._id;
        delete ret.__v;
        delete ret.storageKey; // Never expose internal path to client
        return ret;
      },
    },
  }
);

// Virtual for secure playback and download endpoints
recordingSchema.virtual('playbackUrl').get(function () {
  if (this.status !== 'completed') return null;
  return `/api/meetings/${this.meetingId}/recordings/${this.recordingId}/stream`;
});

recordingSchema.virtual('downloadUrl').get(function () {
  if (this.status !== 'completed') return null;
  return `/api/meetings/${this.meetingId}/recordings/${this.recordingId}/download`;
});

// Indexes for query performance
recordingSchema.index({ meetingId: 1, createdAt: -1 });
recordingSchema.index({ egressId: 1 });
recordingSchema.index({ meeting: 1, status: 1 });

export const Recording = mongoose.model('Recording', recordingSchema);
export default Recording;
