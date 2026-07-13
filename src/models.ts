import mongoose, { Document, Schema } from "mongoose";
import bcrypt from "bcryptjs";

export type UserRole = "user" | "admin";
export type AuthProvider = "local" | "google";

export interface IUser extends Document {
  name: string;
  email: string;
  password?: string;
  phone?: string;
  role: UserRole;
  authProvider: AuthProvider;
  googleId?: string;
  createdAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: {
      type: String,
      minlength: 6,
      required: function (this: IUser) {
        return this.authProvider === "local";
      },
    },
    phone: { type: String, default: "" },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    authProvider: { type: String, enum: ["local", "google"], default: "local" },
    googleId: { type: String, default: undefined },
  },
  { timestamps: true }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password") || !this.password) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = function (candidate: string) {
  if (!this.password) return Promise.resolve(false);
  return bcrypt.compare(candidate, this.password);
};

export const User = mongoose.model<IUser>("User", userSchema);


/* ---------------- CAR ---------------- */

export interface ICar extends Document {
  title: string;
  brand: string;
  carModel: string;
  year: number;
  price: number;
  condition: "New" | "Used";
  fuelType: "Petrol" | "Diesel" | "CNG" | "Electric" | "Hybrid";
  transmission: "Manual" | "Automatic";
  mileage: number;
  location: string;
  shortDescription: string;
  fullDescription: string;
  images: string[];
  seller: mongoose.Types.ObjectId;
  status: "pending" | "approved" | "rejected";
  rating: number;
  createdAt: Date;
}

const carSchema = new Schema<ICar>(
  {
    title: { type: String, required: true, trim: true },
    brand: { type: String, required: true },
    carModel: { type: String, required: true },
    year: { type: Number, required: true },
    price: { type: Number, required: true },
    condition: { type: String, enum: ["New", "Used"], default: "Used" },
    fuelType: {
      type: String,
      enum: ["Petrol", "Diesel", "CNG", "Electric", "Hybrid"],
      default: "Petrol",
    },
    transmission: { type: String, enum: ["Manual", "Automatic"], default: "Manual" },
    mileage: { type: Number, default: 0 },
    location: { type: String, required: true },
    shortDescription: { type: String, required: true, maxlength: 200 },
    fullDescription: { type: String, required: true },
    images: { type: [String], default: [] },
    seller: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "approved" },
    rating: { type: Number, default: 0, min: 0, max: 5 },
  },
  { timestamps: true }
);

carSchema.index({ title: "text", brand: "text", carModel: "text", location: "text" });

export const Car = mongoose.model<ICar>("Car", carSchema);