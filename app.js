const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;
const app = express();
app.use(express.json());

const Connection = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    app.listen(3000, () => {
      console.log("Server started");
    });
  } catch (error) {
    console.log(`error message : ${error.message}`);
  }
};

Connection();

//AuthenticationToken
const authenticationToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }

  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        console.log(payload, "u");
        next();
      }
    });
  }
};

//API 1
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const Query = `Select * from user where username = '${username}';`;
  const dbUser = await db.get(Query);

  if (dbUser === undefined) {
    if (password.length > 5) {
      const hashedPassword = await bcrypt.hash(password, 10);
      const CreateQuery = `insert into user (name, username, password, gender)
      values ('${name}', '${username}', '${hashedPassword}', '${gender}')`;
      await db.run(CreateQuery);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//Login - API 2
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);

  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//API 3
app.get("/user/tweets/feed", authenticationToken, async (request, response) => {
  const { username } = request;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const userDetails = await db.get(selectUserQuery);
  console.log(userDetails);
  const { user_id } = userDetails;
  console.log(user_id);

  const Query = `SELECT username, tweet, date_time AS dateTime FROM
        follower INNER JOIN tweet ON follower.following_user_id = tweet.user_id
        INNER JOIN user ON tweet.user_id = user.user_id
        WHERE follower.follower_user_id = ${user_id}
        ORDER BY date_time DESC
        LIMIT 4`;
  const dbResponse = await db.all(Query);
  response.send(dbResponse);
});

//API 4
app.get("/user/following/", authenticationToken, async (request, response) => {
  const { username } = request;
  const SelectQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const userDetails = await db.get(SelectQuery);
  const { user_id } = userDetails;
  console.log(user_id);

  const Query = `
        SELECT 
            name
        FROM 
            user INNER JOIN follower ON user.user_id = follower.following_user_id
        WHERE 
            follower.follower_user_id = ${user_id}
        ;`;
  const dbResponse = await db.all(Query);
  response.send(dbResponse);
});

//API 5
app.get("/user/followers/", authenticationToken, async (request, response) => {
  const { username } = request;
  const SelectQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const userDetails = await db.get(SelectQuery);
  const { user_id } = userDetails;

  const Query = `
        SELECT 
            name
        FROM
            user INNER JOIN follower ON user.user_id = follower.follower_user_id
        WHERE 
            follower.following_user_id = ${user_id}   
    ;`;
  const dbResponse = await db.all(Query);
  response.send(dbResponse);
});

//API 6
app.get("/tweets/:tweetId/", authenticationToken, async (request, response) => {
  const { tweetId } = request.params;
  console.log(tweetId);
  const { username } = request;
  const SelectQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const userDetails = await db.get(SelectQuery);
  const { user_id } = userDetails;

  const TweetQuery = `SELECT * FROM tweet WHERE tweet_id = ${tweetId};`;
  const dbTweet = await db.get(TweetQuery);

  const UserFollowsQuery = `SELECT * FROM follower INNER JOIN user 
  ON follower.follower_user_id = user.user_id
  WHERE follower.follower_user_id = ${user_id};`;
  const dbUserFollows = await db.all(UserFollowsQuery);

  if (
    dbUserFollows.some((item) => item.following_user_id === dbTweet.user_id)
  ) {
    console.log(dbUserFollows);
    console.log("-----------------------------");
    console.log(dbTweet);
    const getTweetDetailsQuery = `
            SELECT
                tweet,
                COUNT(DISTINCT(like.like_id)) AS likes,
                COUNT(DISTINCT(reply.reply_id)) AS replies,
                tweet.date_time AS dateTime
            FROM 
                tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
            WHERE 
                tweet.tweet_id = ${tweetId} 
            ;`;
    const dbResponse = await db.get(getTweetDetailsQuery);
    response.send(dbResponse);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//API 7
app.get(
  "/tweets/:tweetId/likes/",
  authenticationToken,
  async (request, response) => {
    const { tweetId } = request.params;
    console.log(tweetId);
    const { username } = request;
    const SelectQuery = `SELECT * FROM user WHERE username = '${username}';`;
    const userDetails = await db.get(SelectQuery);
    const { user_id } = userDetails;

    const getLikedUsersQuery = `
            SELECT 
               *
            FROM 
                follower INNER JOIN tweet ON tweet.user_id = follower.following_user_id INNER JOIN like ON like.tweet_id = tweet.tweet_id 
                INNER JOIN user ON user.user_id = like.user_id
            WHERE 
            tweet.tweet_id = ${tweetId} AND follower.follower_user_id = ${user_id}
    ;`;
    const likedUsers = await db.all(getLikedUsersQuery);
    console.log(likedUsers);

    if (likedUsers.length !== 0) {
      let likes = [];
      const getNamesArray = (likedUsers) => {
        for (let i of likedUsers) {
          likes.push(i.username);
        }
      };

      getNamesArray(likedUsers);
      response.send({ likes });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API 8
app.get(
  "/tweets/:tweetId/replies",
  authenticationToken,
  async (request, response) => {
    const { tweetId } = request.params;
    console.log(tweetId);
    const { username } = request;
    const SelectQuery = `SELECT * FROM user WHERE username = '${username}';`;
    const userDetails = await db.get(SelectQuery);
    const { user_id } = userDetails;
    console.log(user_id);

    const repliesQuery = `
            SELECT 
               *
            FROM 
                follower INNER JOIN tweet ON tweet.user_id = follower.following_user_id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id 
                INNER JOIN user ON user.user_id = reply.user_id
            WHERE 
            tweet.tweet_id = ${tweetId} AND follower.follower_user_id = ${user_id}
    ;`;
    const dbReplies = await db.all(repliesQuery);

    if (dbReplies.length !== 0) {
      let replies = [];
      const getRepliesArray = (dbReplies) => {
        for (let i of dbReplies) {
          let object = {
            name: i.name,
            reply: i.reply,
          };
          replies.push(object);
        }
      };
      getRepliesArray(dbReplies);
      response.send({ replies });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API 9
app.get("/user/tweets/", authenticationToken, async (request, response) => {
  const { username } = request;
  const SelectQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(SelectQuery);
  const { user_id } = dbUser;

  const ForTweetQuery = `
            SELECT
               tweet.tweet AS tweet,
                COUNT(DISTINCT(like.like_id)) AS likes,
                COUNT(DISTINCT(reply.reply_id)) AS replies,
                tweet.date_time AS dateTime
            FROM 
                user INNER JOIN tweet ON user.user_id = tweet.user_id INNER JOIN like ON like.tweet_id = tweet.tweet_id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
            WHERE 
                user.user_id = ${user_id}
            GROUP BY
                tweet.tweet_id
            ;`;
  const dbResponse = await db.all(ForTweetQuery);
  response.send(dbResponse);
});

//API 10
app.post("/user/tweets/", authenticationToken, async (request, response) => {
  const { username } = request;
  const SelectQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(SelectQuery);
  const { user_id } = dbUser;
  const { tweet } = request.body;

  const PostQuery = `INSERT INTO tweet (tweet, user_id)
  VALUES ('${tweet}', ${user_id})`;
  await db.run(PostQuery);
  response.send("Created a Tweet");
});

//API 11
app.delete(
  "/tweets/:tweetId",
  authenticationToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const SelectQuery = `SELECT * FROM user WHERE username = '${username}';`;
    const dbUser = await db.get(SelectQuery);
    const { user_id } = dbUser;

    const selectUserQuery = `SELECT * FROM tweet WHERE tweet.user_id = ${user_id} AND tweet.tweet_id = ${tweetId};`;
    const tweetUser = await db.all(selectUserQuery);
    if (tweetUser.length !== 0) {
      const deleteTweetQuery = `
        DELETE FROM tweet
        WHERE 
            tweet.user_id =${user_id} AND tweet.tweet_id =${tweetId}
    ;`;
      await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);
module.exports = app;
