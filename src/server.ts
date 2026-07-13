import express, { Request, Response } from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import mongoose from "mongoose";
import asyncHandler from "express-async-handler";
import { User } from "./models";
import { generateToken } from "./auth";
import { OAuth2Client } from "google-auth-library";
import { User, Car } from "./models";
import { generateToken, protect, AuthRequest } from "./auth";

dotenv.config();

const app = express();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

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

/* ============ CAR ROUTES ============ */

app.get(
  "/api/cars",
  asyncHandler(async (req: Request, res: Response) => {
    const {
      search = "",
      brand,
      condition,
      fuelType,
      minPrice,
      maxPrice,
      sort = "newest",
      page = "1",
      limit = "8",
    } = req.query as Record<string, string>;

    const query: Record<string, any> = { status: "approved" };
    if (search) query.$text = { $search: search };
    if (brand) query.brand = brand;
    if (condition) query.condition = condition;
    if (fuelType) query.fuelType = fuelType;
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }

    const sortMap: Record<string, any> = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      price_asc: { price: 1 },
      price_desc: { price: -1 },
      rating: { rating: -1 },
    };

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.max(1, parseInt(limit));
    const skip = (pageNum - 1) * limitNum;

    const [cars, total] = await Promise.all([
      Car.find(query)
        .sort(sortMap[sort] || sortMap.newest)
        .skip(skip)
        .limit(limitNum)
        .populate("seller", "name email"),
      Car.countDocuments(query),
    ]);

    res.json({ cars, total, page: pageNum, pages: Math.ceil(total / limitNum) || 1 });
  })
);

app.get(
  "/api/cars/brands/list",
  asyncHandler(async (_req: Request, res: Response) => {
    const brands = await Car.distinct("brand", { status: "approved" });
    res.json(brands);
  })
);

app.get(
  "/api/cars/mine/list",
  protect,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const cars = await Car.find({ seller: req.user!._id }).sort({ createdAt: -1 });
    res.json(cars);
  })
);

app.get(
  "/api/cars/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const car = await Car.findById(req.params.id).populate("seller", "name email phone");
    if (!car) {
      res.status(404);
      throw new Error("Car not found");
    }
    res.json(car);
  })
);

app.get(
  "/api/cars/:id/related",
  asyncHandler(async (req: Request, res: Response) => {
    const car = await Car.findById(req.params.id);
    if (!car) {
      res.status(404);
      throw new Error("Car not found");
    }
    const related = await Car.find({ _id: { $ne: car._id }, brand: car.brand, status: "approved" }).limit(4);
    res.json(related);
  })
);

app.post(
  "/api/cars",
  protect,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const {
      title, brand, carModel, year, price, condition, fuelType,
      transmission, mileage, location, shortDescription, fullDescription, images,
    } = req.body;

    if (!title || !brand || !carModel || !year || !price || !location || !shortDescription || !fullDescription) {
      res.status(400);
      throw new Error("Please fill in all required fields");
    }

    const car = await Car.create({
      title, brand, carModel, year, price, condition, fuelType,
      transmission, mileage, location, shortDescription, fullDescription,
      images: images && images.length ? images : ["https://images.unsplash.com/photo-1502877338535-766e1452684a?w=800"],
      seller: req.user!._id,
    });

    res.status(201).json(car);
  })
);

app.delete(
  "/api/cars/:id",
  protect,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const car = await Car.findById(req.params.id);
    if (!car) {
      res.status(404);
      throw new Error("Car not found");
    }

    const isOwner = car.seller.toString() === req.user!._id.toString();
    const isAdmin = req.user!.role === "admin";
    if (!isOwner && !isAdmin) {
      res.status(403);
      throw new Error("You are not allowed to delete this listing");
    }

    await car.deleteOne();
    res.json({ message: "Car listing removed successfully" });
  })
);

app.post(
  "/api/auth/google",
  asyncHandler(async (req: Request, res: Response) => {
    const { credential } = req.body;

    if (!credential) {
      res.status(400);
      throw new Error("Google credential is missing");
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    if (!payload?.email) {
      res.status(400);
      throw new Error("Could not verify Google account");
    }

    let user = await User.findOne({ email: payload.email.toLowerCase() });

    if (user && user.authProvider === "local") {
      res.status(400);
      throw new Error("This email is already registered with a password. Please log in normally.");
    }

    if (!user) {
      user = await User.create({
        name: payload.name || "Google User",
        email: payload.email,
        authProvider: "google",
        googleId: payload.sub,
      });
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