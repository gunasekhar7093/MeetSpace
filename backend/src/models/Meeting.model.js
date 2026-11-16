import mongoose from 'mongoose';
import { MEETING_ID_REGEX, buildMeetingLink } from '../utils/meetingId.utils.js';

const participantSubSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: {
        values: ['joined', 'left', 'waiting'],
        message: 'Participant status must be joined, left, or waiting.',
      },
      default: 'joined',
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    leftAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false }
);

const meetingSettingsSchema = new mongoose.Schema(
  {
    waitingRoomEnabled: {
      type: Boolean,
      default: false,
    },
    chatEnabled: {
      type: Boolean,
      default: true,
    },
    screenShareEnabled: {
      type: Boolean,
      default: true,
    },
    participantLimit: {
      type: Number,
      default: 50,
      min: [2, 'Participant limit must be at least 2.'],
      max: [500, 'Participant limit cannot exceed 500.'],
    },
    allowParticipantScreenShare: {
      type: Boolean,
      default: true,
    },
  },
  { _id: false }
);

const meetingSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Meeting title is required.'],
      trim: true,
      minlength: [2, 'Meeting title must be at least 2 characters long.'],
      maxlength: [120, 'Meeting title cannot exceed 120 characters.'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters.'],
      default: '',
    },
    meetingId: {
      type: String,
      required: [true, 'Meeting ID is required.'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [MEETING_ID_REGEX, 'Invalid Meeting ID format.'],
    },
    host: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Meeting host is required.'],
    },
    participants: {
      type: [participantSubSchema],
      default: [],
    },
    scheduledAt: {
      type: Date,
      default: null,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    endedAt: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: {
        values: ['scheduled', 'active', 'ended', 'cancelled'],
        message: 'Invalid meeting status.',
      },
      default: 'scheduled',
    },
    isInstant: {
      type: Boolean,
      default: false,
    },
    settings: {
      type: meetingSettingsSchema,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        delete ret.__v;
        delete ret.id;
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      transform(_doc, ret) {
        delete ret.__v;
        delete ret.id;
        return ret;
      },
    },
  }
);

meetingSchema.virtual('meetingLink').get(function getMeetingLink() {
  return buildMeetingLink(this.meetingId);
});

// Indexes for listing, history queries, and participant lookups
meetingSchema.index({ host: 1, status: 1, scheduledAt: -1 });
meetingSchema.index({ 'participants.user': 1, status: 1 });
meetingSchema.index({ status: 1, createdAt: -1 });

const Meeting = mongoose.model('Meeting', meetingSchema);

export default Meeting;

