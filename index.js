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
    origin: ["http://localhost:5173"],
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
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
    //commit this line when deploy on vercel -- end

    const booksDB = client.db("bookDB");
    const booksCollection = booksDB.collection("books");
    const borrowsCollection = booksDB.collection("borrows");

    app.get("/books", async (req, res) => {
      const result = await booksCollection.find().toArray();
      res.send(result);
    });

    app.get("/book/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await booksCollection.findOne(query);
      res.send(result);
    });

    app.post("/books/new", async (req, res) => {
      const newBook = req.body;
      const result = await booksCollection.insertOne(newBook);
      res.send(result);
    });

    app.put("/book/:id/borrow", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };

      const { email } = req.user;
      const { returnDate, name } = req.body;

      const userBorrowedBooksCount = await borrowsCollection.countDocuments({
        borrowerEmail: email,
      });

      // If the user has borrowed less than 3 books, allow borrowing
      if (userBorrowedBooksCount < 30) {
        try {
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
          console.log(error);
          // If an error occurs, abort the transaction
          await session.abortTransaction();
          session.endSession();

          console.error(error);
          res.status(500).send("Error borrowing book.");
        }
      } else {
        res
          .status(403)
          .send("You have reached the maximum limit of 3 borrowed books.");
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
            const bookId = borrowedBook.bookId;
            const bookDetails = await booksCollection.findOne({
              _id: new ObjectId(bookId),
            });
            return {
              ...borrowedBook,
              ...bookDetails,
            };
          })
        );

        res.send(borrowedBooksDetails);
      } catch (error) {
        console.error(error);
        res.status(500).send("Error fetching borrowed books.");
      }
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
  const { email } = req.body;
  res
    .clearCookie("token", { ...cookieOptions, maxAge: 0 })
    .send({ success: true });
});

//jwt routes -- end

app.listen(port, () => {
  console.log(`server running on port ${port}`);
});
