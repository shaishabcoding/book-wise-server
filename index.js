const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ObjectId, ServerApiVersion } = require("mongodb");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const moment = require("moment");

const app = express();
const port = process.env.PORT || 5000;

//middleware
app.use(express.json());
app.use(
  cors({
    origin: [
      // "http://localhost:5173",
      "https://book-wise-316.web.app",
      "https://book-wise-316.firebaseapp.com",
    ],
    credentials: true,
  })
);
app.use(cookieParser());

//jwt middleware
const verifyToken = (req, res, next) => {
  const token = req?.cookies?.token;
  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "unauthorized access" });
    }
    req.user = { email: decoded };
    next();
  });
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.bhmvsbs.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    //commit this line when deploy on vercel -- start
    // await client.connect();
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
    //commit this line when deploy on vercel -- end

    const booksDB = client.db("bookDB");
    const booksCollection = booksDB.collection("books");
    const borrowsCollection = booksDB.collection("borrows");

    app.get("/books", verifyToken, async (req, res) => {
      const result = await booksCollection.find().toArray();
      res.send(result);
    });

    app.get("/books/popular", async (req, res) => {
      const result = await booksCollection
        .find()
        .sort({ rating: -1 })
        .limit(6)
        .toArray();
      res.send(result);
    });

    app.get("/books/categories/:category", verifyToken, async (req, res) => {
      const { category } = req.params;
      const query = { category };
      const cursor = booksCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/book/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await booksCollection.findOne(query);
      res.send(result);
    });

    app.get("/books/my", verifyToken, async (req, res) => {
      const { email } = req.user;
      const query = { email };
      const cursor = booksCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.post("/books/new", verifyToken, async (req, res) => {
      const newBook = req.body;
      if (req.user.email !== newBook.email) {
        return res.status(403).send("forbidden");
      }
      const result = await booksCollection.insertOne(newBook);
      res.send(result);
    });

    app.put("/book/:id/borrow", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };

      const { email } = req.user;
      const { returnDate, name } = req.body;

      try {
        // Check if the user has already borrowed the book
        const hasBorrowedBook = await borrowsCollection.findOne({
          bookId: id,
          borrowerEmail: email,
        });

        if (hasBorrowedBook) {
          return res.status(400).send("You have already borrowed this book.");
        }

        // Check if the user has reached the maximum limit of borrowed books
        const userBorrowedBooksCount = await borrowsCollection.countDocuments({
          borrowerEmail: email,
        });

        if (userBorrowedBooksCount > 2) {
          return res
            .status(403)
            .send("You have reached the maximum limit of borrowed books.");
        }

        // Begin a session
        const session = client.startSession();
        session.startTransaction();

        // Update the book quantity
        const result = await booksCollection.updateOne(query, {
          $inc: { quantity: -1 },
        });

        // Create a borrowing record
        const borrowRecord = {
          bookId: id,
          borrowerEmail: email,
          borrowDate: moment().format("MM/DD/YYYY"),
          returnDate,
          name,
        };

        // Insert the borrowing record
        await borrowsCollection.insertOne(borrowRecord, { session });

        // Commit the transaction
        await session.commitTransaction();
        session.endSession();

        res.send(result);
      } catch (error) {
        console.error(error);
        // If an error occurs, abort the transaction
        await session.abortTransaction();
        session.endSession();

        res.status(500).send("Error borrowing book.");
      }
    });

    app.get("/books/borrowed", verifyToken, async (req, res) => {
      const { email } = req.user;
      try {
        // Find all borrowed books for the user
        const borrowedBooks = await borrowsCollection
          .find({ borrowerEmail: email }, { projection: { _id: 0 } })
          .toArray();

        // Fetch book details for each borrowed book
        const borrowedBooksDetails = await Promise.all(
          borrowedBooks.map(async (borrowedBook) => {
            const { bookId } = borrowedBook;
            const bookDetails = await booksCollection.findOne({
              _id: new ObjectId(bookId),
            });

            // If book details not found, remove the borrowed book
            if (!bookDetails) return null;

            return {
              ...borrowedBook,
              ...bookDetails,
            };
          })
        );

        // Filter out null values (where book details were not found)
        const filteredBorrowedBooksDetails = borrowedBooksDetails.filter(
          (book) => book !== null
        );

        res.send(filteredBorrowedBooksDetails);
      } catch (error) {
        console.error(error);
        res.status(500).send("Error fetching borrowed books.");
      }
    });

    app.put("/book/:id/edit", verifyToken, async (req, res) => {
      const book = req.body;
      if (req.user.email !== book.email) {
        return res.status(403).send("forbidden");
      }
      const { id } = req.params;
      const query = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updatedBook = {
        $set: book,
      };
      const result = await booksCollection.updateOne(
        query,
        updatedBook,
        options
      );
      res.send(result);
    });

    app.put("/book/:id/return", verifyToken, async (req, res) => {
      const id = req.params.id;
      try {
        // Increase the book quantity by 1
        await booksCollection.updateOne(
          { _id: new ObjectId(id) },
          { $inc: { quantity: 1 } }
        );

        // Remove the borrowing record from the borrowsCollection
        await borrowsCollection.deleteOne({
          bookId: id,
          borrowerEmail: req.user.email,
        });

        res.status(200).send({ success: true });
      } catch (error) {
        console.error("Error returning book:", error);
        res.status(500).send("Error returning book.");
      }
    });

    app.delete("/book/:email/:id", verifyToken, async (req, res) => {
      const { id, email } = req.params;
      if (req.user.email !== email) {
        return res.status(403).send("forbidden");
      }
      const query = { _id: new ObjectId(id) };
      const result = await booksCollection.deleteOne(query);
      res.send(result);
    });
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("server running");
});

//jwt routes -- start
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
};

//creating Token
app.post("/jwt", async (req, res) => {
  const { email } = req.body;
  const token = jwt.sign(email, process.env.ACCESS_TOKEN_SECRET);
  res.cookie("token", token, cookieOptions).send({ success: true });
});

//clearing Token
app.post("/logout", async (req, res) => {
  res
    .clearCookie("token", { ...cookieOptions, maxAge: 0 })
    .send({ success: true });
});

//jwt routes -- end

app.listen(port, () => {
  console.log(`server running on port ${port}`);
});
