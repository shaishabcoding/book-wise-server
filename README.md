# BookWise API

This is the backend API for BookWise, a platform for managing a virtual book library.

## API Base URL

The API is hosted at [https://book-wise-316.vercel.app/](https://book-wise-316.vercel.app/)

## Endpoints

### GET /books

- Returns all books in the library.

### GET /books/popular

- Returns the most popular books in the library (sorted by rating).

### GET /books/categories/:category

- Returns all books in a specific category.

### GET /book/:id

- Returns details of a specific book by its ID.

### GET /books/my

- Returns books added by the authenticated user.

### POST /books/new

- Adds a new book to the library.

### PUT /book/:id/borrow

- Borrows a book by its ID.

### GET /books/borrowed

- Returns books currently borrowed by the authenticated user.

### PUT /book/:id/edit

- Edits details of a book by its ID.

### PUT /book/:id/return

- Returns a borrowed book by its ID.

### DELETE /book/:email/:id

- Deletes a book by its ID, owned by the specified email.

## Authentication

- This API uses JSON Web Tokens (JWT) for authentication.
- Use the `/jwt` endpoint to obtain a token by providing the email in the request body.
- Use the `/logout` endpoint to clear the token and log out.

## Dependencies

- `express`: "^4.17.1"
- `cors`: "^2.8.5"
- `dotenv`: "^10.0.0"
- `mongodb`: "^4.3.6"
- `cookie-parser`: "^1.4.5"
- `jsonwebtoken`: "^8.5.1"
- `moment`: "^2.29.1"

## Running the Server Locally

1. Clone the repository.
2. Install dependencies with `npm install`.
3. Create a `.env` file based on `.env.example` and fill in the necessary environment variables.
4. Run the server with `npm start`.

## Author

Shaishab Chandra Shil

## License

This project is licensed under the [MIT License](LICENSE).
