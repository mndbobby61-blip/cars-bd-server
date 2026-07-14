import "dotenv/config";
import bcrypt from "bcryptjs";
import { connectDB, usersCollection, carsCollection, IUser, ICar } from "./models";

const images = [
  "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800",
  "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800",
  "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800",
  "https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=800",
  "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=800",
  "https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800",
];

const sampleCars = [
  { title: "Toyota Premio 2018 - Excellent Condition", brand: "Toyota", carModel: "Premio", year: 2018, price: 2650000, condition: "Used" as const, fuelType: "Petrol" as const, transmission: "Automatic" as const, mileage: 42000, location: "Gulshan, Dhaka" },
  { title: "Honda CR-V 2020 - Low Mileage", brand: "Honda", carModel: "CR-V", year: 2020, price: 5200000, condition: "Used" as const, fuelType: "Petrol" as const, transmission: "Automatic" as const, mileage: 21000, location: "Chattogram" },
  { title: "Tesla Model 3 2023 - Brand New", brand: "Tesla", carModel: "Model 3", year: 2023, price: 8900000, condition: "New" as const, fuelType: "Electric" as const, transmission: "Automatic" as const, mileage: 0, location: "Banani, Dhaka" },
  { title: "Toyota Axio 2017 Hybrid", brand: "Toyota", carModel: "Axio", year: 2017, price: 1980000, condition: "Used" as const, fuelType: "Hybrid" as const, transmission: "Automatic" as const, mileage: 58000, location: "Sylhet" },
  { title: "Mitsubishi Pajero 2019 - SUV", brand: "Mitsubishi", carModel: "Pajero", year: 2019, price: 6100000, condition: "Used" as const, fuelType: "Diesel" as const, transmission: "Automatic" as const, mileage: 35000, location: "Dhanmondi, Dhaka" },
  { title: "Suzuki Alto 2021 - City Car", brand: "Suzuki", carModel: "Alto", year: 2021, price: 1350000, condition: "Used" as const, fuelType: "Petrol" as const, transmission: "Manual" as const, mileage: 18000, location: "Rajshahi" },
  { title: "Nissan X-Trail 2018", brand: "Nissan", carModel: "X-Trail", year: 2018, price: 3450000, condition: "Used" as const, fuelType: "Petrol" as const, transmission: "Automatic" as const, mileage: 47000, location: "Khulna" },
  { title: "BMW 3 Series 2022 - Luxury Sedan", brand: "BMW", carModel: "3 Series", year: 2022, price: 9800000, condition: "Used" as const, fuelType: "Petrol" as const, transmission: "Automatic" as const, mileage: 9000, location: "Baridhara, Dhaka" },
  { title: "Hyundai Tucson 2021", brand: "Hyundai", carModel: "Tucson", year: 2021, price: 4200000, condition: "Used" as const, fuelType: "Petrol" as const, transmission: "Automatic" as const, mileage: 25000, location: "Uttara, Dhaka" },
  { title: "Toyota Corolla 2020", brand: "Toyota", carModel: "Corolla", year: 2020, price: 3100000, condition: "Used" as const, fuelType: "Petrol" as const, transmission: "Automatic" as const, mileage: 32000, location: "Mirpur, Dhaka" },
  { title: "Ford Ranger 2019 - Pickup", brand: "Ford", carModel: "Ranger", year: 2019, price: 3800000, condition: "Used" as const, fuelType: "Diesel" as const, transmission: "Manual" as const, mileage: 41000, location: "Cumilla" },
  { title: "Kia Sportage 2023", brand: "Kia", carModel: "Sportage", year: 2023, price: 5600000, condition: "New" as const, fuelType: "Petrol" as const, transmission: "Automatic" as const, mileage: 0, location: "Bashundhara, Dhaka" },
];

async function seed() {
  await connectDB();

  await usersCollection().deleteMany({});
  await carsCollection().deleteMany({});

  const now = new Date();

  const adminUser: IUser = {
    name: "Admin User",
    email: "admin@carsbd.com",
    password: await bcrypt.hash("Admin@123", 10),
    role: "admin",
    createdAt: now,
    updatedAt: now,
  };
  const demoUserDoc: IUser = {
    name: "Demo User",
    email: "user@carsbd.com",
    password: await bcrypt.hash("User@123", 10),
    role: "user",
    createdAt: now,
    updatedAt: now,
  };

  const adminResult = await usersCollection().insertOne(adminUser);
  const userResult = await usersCollection().insertOne(demoUserDoc);

  const cars: ICar[] = sampleCars.map((c, i) => ({
    ...c,
    shortDescription: `${c.brand} ${c.carModel} in great condition, well maintained.`,
    fullDescription: `This ${c.year} ${c.brand} ${c.carModel} has complete service history and is ready to drive. Contact the seller for a physical inspection and test drive.`,
    images: [images[i % images.length], images[(i + 1) % images.length]],
    seller: i % 2 === 0 ? adminResult.insertedId : userResult.insertedId,
    status: "approved",
    rating: Number((Math.random() * 1.5 + 3.5).toFixed(1)),
    createdAt: now,
    updatedAt: now,
  }));

  await carsCollection().insertMany(cars);

  console.log(`Seed complete: ${cars.length} cars inserted.`);
  console.log("Admin: admin@carsbd.com / Admin@123");
  console.log("User: user@carsbd.com / User@123");
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});