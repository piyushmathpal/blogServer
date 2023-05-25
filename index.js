if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const User = require("./models/User");
const Post = require("./models/Post");
const bcrypt = require("bcryptjs");
const app = express();
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const multer = require("multer");
const uploader = multer({
  storage: multer.diskStorage({}),
  limits: { fileSize: 50000000 },
});

// const uploadMiddleware = multer({ dest: 'uploads/' });
const cloudinary = require("cloudinary");
const salt = bcrypt.genSaltSync(10);
const secret = "asdfe45we45w345wegw345werjktjwertkj";

// app.use(
//   cors({
//     credentials: true,
//     origin: "https://vocal-treacle-8a2496.netlify.app",
//   })
// );
app.use(cors())
app.use(express.json());
app.use(cookieParser());

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin","*")
  res.header("Access-Control-Allow-Methods","GET,OPTIONS,PATCH,DELETE,POST,PUT")
  res.header("Access-Control-Allow-Headers","Origin, X-Requested-With, Content-Type, Accept, Authorization,Set-Cookie")
  next()
});

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: "Y8XHl6RwvSi2JKif3nhO-8kogBk",
});

const CONNECTION_URL = process.env.DB_URL;
const PORT = process.env.Port || 4000;

app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  try {
    const userDoc = await User.create({
      username,
      password: bcrypt.hashSync(password, salt),
    });
    jwt.sign({ username, id: userDoc._id }, secret, {}, (err, token) => {
      if (err) throw err;
      console.log(token);
      res.cookie("token", token).json({
        id: userDoc._id,
        username,
      });
    });
  } catch (e) {
    console.log(e);
    res.status(400).json({ error: e.message });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    console.log(req.body);
    const userDoc = await User.findOne({ username });
    const passOk = bcrypt.compareSync(password, userDoc.password);
    console.log(passOk);

    if (passOk) {
      // logged in
      jwt.sign({ username, id: userDoc._id }, secret, {}, (err, token) => {
        if (err) throw err;
        res.cookie("token", token).json({
          id: userDoc._id,
          username,
        });
      });
    } else {
      res.status(400).json("wrong credentials");
    }
  } catch (e) {
    console.log(e);
  }
});

app.get("/profile", (req, res) => {
  const { token } = req.cookies;
  if (!token) {
    res.cookie("token", "").json("ok");
  }
  // console.log(window.sessionStorage.getItem('token'));
  jwt.verify(token, secret, {}, (err, info) => {
    if (err) throw err;
    res.json(info);
  });
});

app.post("/logout", (req, res) => {
  res.cookie("token", "").json("ok");
});

app.post("/post", uploader.single("file"), async (req, res) => {
  const upload = await cloudinary.v2.uploader.upload(req.file.path);
  console.log(upload);

  const { token } = req.cookies;
  jwt.verify(token, secret, {}, async (err, info) => {
    if (err) throw err;
    const { title, summary, content } = req.body;
    const postDoc = await Post.create({
      title,
      summary,
      content,
      cover: upload.secure_url,
      author: info.id,
    });
    res.json(postDoc);
  });
});

app.put("/post", uploader.single("file"), async (req, res) => {
  try {
    const { token } = req.cookies;
    console.log(token, "33");
    jwt.verify(token, secret, {}, async (err, info) => {
      if (err) throw err;
      const { id, title, summary, content } = req.body;
      let postDoc = await Post.findById(id);
      const isAuthor =
        JSON.stringify(postDoc.author) === JSON.stringify(info.id);
      if (!isAuthor) {
        return res.status(400).json("you are not the author");
      }
      let newPath = postDoc.cover;
      if (req.file) {
        const upload = await cloudinary.v2.uploader.upload(req.file.path);
        newPath = upload.secure_url;
        const oldUrl = postDoc.cover;
        const getPublicId = (oldUrl) => oldUrl.split("/").pop().split(".")[0];
        const deleted = await cloudinary.v2.uploader.destroy(
          getPublicId(oldUrl)
        );
      }

      console.log(postDoc);
      await postDoc.updateOne({
        title,
        summary,
        content,
        cover: newPath,
      });

      res.json(postDoc);
    });
  } catch (e) {
    console.log(e);
    res.status(500).json({ message: "something went wrong" });
  }
});

app.delete("/post/:id", async (req, res) => {
  const { token } = req.cookies;
  jwt.verify(token, secret, {}, async (err, info) => {
    if (err) throw err;
    const postDoc = await Post.findById(req.params.id);
    if (postDoc == null) {
      return res.status(404).json("post not found");
    }
    const isAuthor = JSON.stringify(postDoc.author) === JSON.stringify(info.id);
    if (!isAuthor) {
      return res.status(400).json("you are not the author");
    }
    const oldUrl = postDoc.cover;
    const getPublicId = (oldUrl) => oldUrl.split("/").pop().split(".")[0];
    const deleted = await cloudinary.v2.uploader.destroy(getPublicId(oldUrl));
    await postDoc.deleteOne();
    res.json(postDoc);
  });
});

app.get("/post", async (req, res) => {
  res.json(
    await Post.find()
      .populate("author", ["username"])
      .sort({ createdAt: -1 })
      .limit(20)
  );
});

app.get("/post/:id", async (req, res) => {
  const { id } = req.params;
  const postDoc = await Post.findById(id).populate("author", ["username"]);
  res.json(postDoc);
});

mongoose
  .connect(CONNECTION_URL, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() =>
    app.listen(PORT, () => console.log(`server Running on Port :${PORT}`))
  )
  .catch((err) => console.log(err));
