import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import { ObjectId } from "mongodb";
import { OAuth2Client } from "google-auth-library";
import { connectDB, usersCollection, carsCollection, IUser, ICar } from "./models";
import { protect, adminOnly, signToken, AuthRequest } from "./auth";

const app = express();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

app.use(cors({ origin: process.env.CLIENT_URL || "*" }));
app.use(express.json());

connectDB().catch((err) => {
  console.error("MongoDB connection failed:", err);
  process.exit(1);
});

/* ---------------- Helpers ---------------- */
function toAuthResponse(user: any) {
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatar: user.avatar,
    token: signToken(user._id.toString()),
  };
}

app.get("/api/health", (req: Request, res: Response) => res.json({ status: "ok" }));

/* ================= AUTH ROUTES ================= */

app.post("/api/auth/register", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email, and password are required" });
    }
    const existing = await usersCollection().findOne({ email: email.toLowerCase() });
    if (existing) return res.status(400).json({ message: "An account with this email already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const now = new Date();
    const newUser: IUser = {
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      phone,
      role: "user",
      createdAt: now,
      updatedAt: now,
    };
    const result = await usersCollection().insertOne(newUser);
    res.status(201).json(toAuthResponse({ ...newUser, _id: result.insertedId }));
  } catch (err) {
    next(err);
  }
});

app.post("/api/auth/login", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;
    const user = await usersCollection().findOne({ email: email?.toLowerCase() });
    if (!user || !user.password || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    res.json(toAuthResponse(user));
  } catch (err) {
    next(err);
  }
});

app.post("/api/auth/google", async (req: Request, res: Response) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ message: "Missing Google credential" });

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.email) return res.status(401).json({ message: "Google sign-in failed" });

    let user = await usersCollection().findOne({ email: payload.email.toLowerCase() });

    if (!user) {
      const now = new Date();
      const newUser: IUser = {
        name: payload.name || "Google User",
        email: payload.email.toLowerCase(),
        googleId: payload.sub,
        avatar: payload.picture,
        role: "user",
        createdAt: now,
        updatedAt: now,
      };
      const result = await usersCollection().insertOne(newUser);
      user = { ...newUser, _id: result.insertedId };
    } else if (!user.googleId) {
      await usersCollection().updateOne(
        { _id: user._id },
        { $set: { googleId: payload.sub, avatar: user.avatar || payload.picture, updatedAt: new Date() } }
      );
      user.googleId = payload.sub;
    }

    res.json(toAuthResponse(user));
  } catch (err) {
    res.status(401).json({ message: "Google sign-in failed" });
  }
});

/* ================= CAR ROUTES ================= */

const sortMap: Record<string, any> = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  price_asc: { price: 1 },
  price_desc: { price: -1 },
  rating: { rating: -1 },
};

async function attachSeller(car: ICar) {
  const seller = await usersCollection().findOne(
    { _id: car.seller },
    { projection: { name: 1, email: 1, phone: 1 } }
  );
  return { ...car, seller: seller || car.seller };
}

app.get("/api/cars/brands/list", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const brands = await carsCollection().distinct("brand", { status: "approved" });
    res.json(brands.sort());
  } catch (err) {
    next(err);
  }
});

app.get("/api/cars/mine/list", protect, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const cars = await carsCollection()
      .find({ seller: req.user!._id })
      .sort({ createdAt: -1 })
      .toArray();
    res.json(cars);
  } catch (err) {
    next(err);
  }
});

app.get("/api/cars", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      search, brand, condition, fuelType,
      minPrice, maxPrice, sort = "newest",
      page = "1", limit = "8",
    } = req.query as Record<string, string>;

    const filter: any = { status: "approved" };
    if (brand) filter.brand = brand;
    if (condition) filter.condition = condition;
    if (fuelType) filter.fuelType = fuelType;
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { brand: { $regex: search, $options: "i" } },
        { carModel: { $regex: search, $options: "i" } },
        { location: { $regex: search, $options: "i" } },
      ];
    }

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.max(1, Number(limit));

    const [cars, total] = await Promise.all([
      carsCollection()
        .find(filter)
        .sort(sortMap[sort] || sortMap.newest)
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .toArray(),
      carsCollection().countDocuments(filter),
    ]);

    const carsWithSeller = await Promise.all(cars.map(attachSeller));

    res.json({
      cars: carsWithSeller,
      total,
      page: pageNum,
      pages: Math.max(1, Math.ceil(total / limitNum)),
    });
  } catch (err) {
    next(err);
  }
});

app.post("/api/cars", protect, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const {
      title, brand, carModel, year, price, condition, fuelType,
      transmission, mileage, location, shortDescription, fullDescription, images,
    } = req.body;

    if (!title || !brand || !carModel || !year || !price || !location || !shortDescription || !fullDescription) {
      return res.status(400).json({ message: "Please fill in all required fields" });
    }

    const now = new Date();
    const newCar: ICar = {
      title, brand, carModel, year: Number(year), price: Number(price),
      condition: condition || "Used",
      fuelType: fuelType || "Petrol",
      transmission: transmission || "Manual",
      mileage: Number(mileage) || 0,
      location, shortDescription, fullDescription,
      images: images && images.length ? images : ["https://images.unsplash.com/photo-1493238792000-8113da705763?w=800"],
      seller: req.user!._id,
      status: req.user!.role === "admin" ? "approved" : "pending",
      rating: 4,
      createdAt: now,
      updatedAt: now,
    };

    const result = await carsCollection().insertOne(newCar);
    res.status(201).json({ ...newCar, _id: result.insertedId });
  } catch (err) {
    next(err);
  }
});

app.get("/api/cars/:id/related", async (req: Request, res: Response) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.json([]);
    const car = await carsCollection().findOne({ _id: new ObjectId(req.params.id) });
    if (!car) return res.json([]);
    const related = await carsCollection()
      .find({ _id: { $ne: car._id }, brand: car.brand, status: "approved" })
      .limit(4)
      .toArray();
    const withSeller = await Promise.all(related.map(attachSeller));
    res.json(withSeller);
  } catch (err) {
    res.json([]);
  }
});

app.get("/api/cars/:id", async (req: Request, res: Response) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ message: "Car not found" });
    const car = await carsCollection().findOne({ _id: new ObjectId(req.params.id) });
    if (!car) return res.status(404).json({ message: "Car not found" });
    res.json(await attachSeller(car));
  } catch (err) {
    res.status(404).json({ message: "Car not found" });
  }
});

app.put("/api/cars/:id", protect, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ message: "Car not found" });
    const car = await carsCollection().findOne({ _id: new ObjectId(req.params.id) });
    if (!car) return res.status(404).json({ message: "Car not found" });
    if (car.seller.toString() !== req.user!._id.toString() && req.user!.role !== "admin") {
      return res.status(403).json({ message: "Not authorized to edit this listing" });
    }

    const updates = { ...req.body, updatedAt: new Date() };
    if (req.user!.role !== "admin") updates.status = "pending";
    delete updates._id;

    await carsCollection().updateOne({ _id: car._id }, { $set: updates });
    const updated = await carsCollection().findOne({ _id: car._id });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

app.delete("/api/cars/:id", protect, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ message: "Car not found" });
    const car = await carsCollection().findOne({ _id: new ObjectId(req.params.id) });
    if (!car) return res.status(404).json({ message: "Car not found" });
    if (car.seller.toString() !== req.user!._id.toString() && req.user!.role !== "admin") {
      return res.status(403).json({ message: "Not authorized to delete this listing" });
    }
    await carsCollection().deleteOne({ _id: car._id });
    res.json({ message: "Listing deleted" });
  } catch (err) {
    next(err);
  }
});

/* ================= ADMIN ROUTES ================= */

app.get("/api/admin/stats", protect, adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [totalCars, totalUsers, pendingCars, approvedCars] = await Promise.all([
      carsCollection().countDocuments(),
      usersCollection().countDocuments(),
      carsCollection().countDocuments({ status: "pending" }),
      carsCollection().countDocuments({ status: "approved" }),
    ]);
    res.json({ totalCars, totalUsers, pendingCars, approvedCars });
  } catch (err) {
    next(err);
  }
});

app.get("/api/admin/cars", protect, adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cars = await carsCollection().find().sort({ createdAt: -1 }).toArray();
    const withSeller = await Promise.all(cars.map(attachSeller));
    res.json(withSeller);
  } catch (err) {
    next(err);
  }
});

app.put("/api/admin/cars/:id/status", protect, adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = req.body;
    if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ message: "Car not found" });
    await carsCollection().updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { status, updatedAt: new Date() } }
    );
    const car = await carsCollection().findOne({ _id: new ObjectId(req.params.id) });
    if (!car) return res.status(404).json({ message: "Car not found" });
    res.json(car);
  } catch (err) {
    next(err);
  }
});

app.get("/api/admin/users", protect, adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await usersCollection()
      .find({}, { projection: { password: 0 } })
      .sort({ createdAt: -1 })
      .toArray();
    res.json(users);
  } catch (err) {
    next(err);
  }
});

app.delete("/api/admin/users/:id", protect, adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ message: "User not found" });
    const user = await usersCollection().findOne({ _id: new ObjectId(req.params.id) });
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.role === "admin") return res.status(400).json({ message: "Cannot delete an admin account" });

    await carsCollection().deleteMany({ seller: user._id });
    await usersCollection().deleteOne({ _id: user._id });
    res.json({ message: "User removed" });
  } catch (err) {
    next(err);
  }
});

/* ================= 404 + ERROR HANDLER ================= */

app.use((req: Request, res: Response) => {
  res.status(404).json({ message: "Route not found" });
});

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error(err);
  res.status(err.statusCode || 500).json({ message: err.message || "Server error" });
});

/* ================= START SERVER ================= */

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));