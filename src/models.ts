import { MongoClient, Db, ObjectId } from "mongodb";

/* ---------------- Types ---------------- */

export type UserRole = "user" | "admin";

export interface IUser {
  _id?: ObjectId;
  name: string;
  email: string;
  password?: string;
  phone?: string;
  role: UserRole;
  googleId?: string;
  avatar?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type CarCondition = "New" | "Used";
export type FuelType = "Petrol" | "Diesel" | "CNG" | "Electric" | "Hybrid";
export type Transmission = "Manual" | "Automatic";
export type CarStatus = "pending" | "approved" | "rejected";

export interface ICar {
  _id?: ObjectId;
  title: string;
  brand: string;
  carModel: string;
  year: number;
  price: number;
  condition: CarCondition;
  fuelType: FuelType;
  transmission: Transmission;
  mileage: number;
  location: string;
  shortDescription: string;
  fullDescription: string;
  images: string[];
  seller: ObjectId;
  status: CarStatus;
  rating: number;
  createdAt: Date;
  updatedAt: Date;
}

/* ---------------- DB Connection ---------------- */

let client: MongoClient;
let db: Db;

export async function connectDB(): Promise<Db> {
  if (db) return db;
  client = new MongoClient(process.env.MONGO_URI as string);
  await client.connect();
  db = client.db(); // uses database name from the connection string
  console.log("MongoDB connected");

  // Indexes
  await db.collection<IUser>("users").createIndex({ email: 1 }, { unique: true });
  await db.collection<ICar>("cars").createIndex({
    title: "text",
    brand: "text",
    carModel: "text",
    location: "text",
  });

  return db;
}

export function getDB(): Db {
  if (!db) throw new Error("Database not connected yet");
  return db;
}

export function usersCollection() {
  return getDB().collection<IUser>("users");
}

export function carsCollection() {
  return getDB().collection<ICar>("cars");
}