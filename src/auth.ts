import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";
import { usersCollection, IUser } from "./models";

export interface AuthRequest extends Request {
  user?: IUser & { _id: ObjectId };
}

export async function protect(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Not authorized, no token" });
  }
  try {
    const token = header.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as { id: string };
    const user = await usersCollection().findOne(
      { _id: new ObjectId(decoded.id) },
      { projection: { password: 0 } }
    );
    if (!user) return res.status(401).json({ message: "User no longer exists" });
    req.user = user as IUser & { _id: ObjectId };
    next();
  } catch (err) {
    return res.status(401).json({ message: "Not authorized, token invalid" });
  }
}

export function adminOnly(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
}

export function signToken(id: string) {
  return jwt.sign({ id }, process.env.JWT_SECRET as string, { expiresIn: "7d" });
}