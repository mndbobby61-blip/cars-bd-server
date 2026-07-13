import express, { Request, Response } from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import mongoose from "mongoose";
import asyncHandler from "express-async-handler";
import { User } from "./models";
import { generateToken } from "./auth";

dotenv.config();

const app = express();

app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:3000", credentials: true }));
app.use(express.json());
app.use(morgan("dev"));

app.get("/api/health", (_req, res) => res.json({ status: "ok", service: "AutoBazaar API" }));

/* ============ AUTH ROUTES ============ */

app.post(
  "/api/auth/register",
  asyncHandler(async (req: Request, res: Response) => {
    const { name, email, password, phone } = req.body;

    if (!name || !email || !password) {
      res.status(400);
      throw new Error("Please provide name, email and password");
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      res.status(400);
      throw new Error("An account with this email already exists");
    }

    const user = await User.create({ name, email, password, phone, authProvider: "local" });

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      token: generateToken(user._id.toString()),
    });
  })
);

app.post(
  "/api/auth/login",
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400);
      throw new Error("Please provide email and password");
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !(await user.comparePassword(password))) {
      res.status(401);
      throw new Error("Invalid email or password");
    }

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      token: generateToken(user._id.toString()),
    });
  })
);

const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGO_URI as string)
  .then(() => {
    console.log("MongoDB connected successfully");
    app.listen(PORT, () => console.log(`AutoBazaar API running on port ${PORT}`));
  })
  .catch((error) => {
    console.error("MongoDB connection failed:", error);
    process.exit(1);
  });