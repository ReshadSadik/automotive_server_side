const express = require('express');
const app = express();
const cors = require('cors');
const SSLCommerzPayment = require('sslcommerz');
const { v4: uuidv4 } = require('uuid');

require('dotenv').config();
const { MongoClient } = require('mongodb');
const ObjectId = require('mongodb').ObjectId;
const stripe = require('stripe')(process.env.STRIPE_SECRET);

require('dotenv').config();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const port = process.env.PORT || 5000;

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.2ffsd.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function run() {
  try {
    await client.connect();
    const database = client.db('automotive');
    const productsCollection = database.collection('products');
    const ordersCollection = database.collection('orders');
    const reviewsCollection = database.collection('reviews');
    const usersCollection = database.collection('users');

    // Initialize payment
    app.post('/init', async (req, res) => {
      const productInfo = {
        total_amount: 50000,
        currency: 'BDT',
        tran_id: uuidv4(),
        success_url: 'http://localhost:5000/success',
        fail_url: 'http://localhost:5000/failure',
        cancel_url: 'http://localhost:5000/cancel',
        ipn_url: 'http://localhost:5000/ipn',
        paymentStatus: 'pending',
        shipping_method: 'Courier',
        product_name: req.body.product_name,
        product_category: 'Electronic',
        product_profile: 'anything',
        product_image: 'good',
        cus_name: req.body.cus_name,
        cus_email: req.body.cus_email,
        cus_add1: 'Dhaka',
        cus_add2: 'Dhaka',
        cus_city: 'Dhaka',
        cus_state: 'Dhaka',
        cus_postcode: '1000',
        cus_country: 'Bangladesh',
        cus_phone: '01711111111',
        cus_fax: '01711111111',
        ship_name: req.body.cus_name,
        ship_add1: 'Dhaka',
        ship_add2: 'Dhaka',
        ship_city: 'Dhaka',
        ship_state: 'Dhaka',
        ship_postcode: 1000,
        ship_country: 'Bangladesh',
        multi_card_name: 'mastercard',
        value_a: 'ref001_A',
        value_b: 'ref002_B',
        value_c: 'ref003_C',
        value_d: 'ref004_D',
      };
      // Insert order info
      const result = await ordersCollection.insertOne(productInfo);

      const sslcommer = new SSLCommerzPayment(
        process.env.STORE_ID,
        process.env.STORE_PASSWORD,
        false
      ); //true for live default false for sandbox
      sslcommer.init(productInfo).then((data) => {
        //process the response that got from sslcommerz
        //https://developer.sslcommerz.com/doc/v4/#returned-parameters
        const info = { ...productInfo, ...data };
        console.log(data);
        if (info.GatewayPageURL) {
          res.json(info.GatewayPageURL);
        } else {
          return res.status(400).json({
            message: 'SSL session was not successful',
          });
        }
      });
    });

    app.post('/success', async (req, res) => {
      const result = await ordersCollection.updateOne(
        { tran_id: req.body.tran_id },
        {
          $set: {
            val_id: req.body.val_id,
          },
        }
      );

      res.redirect(`http://localhost:5000/success/${req.body.tran_id}`);
    });
    app.post('/failure', async (req, res) => {
      const result = await ordersCollection.deleteOne({
        tran_id: req.body.tran_id,
      });

      res.redirect(`http://localhost:5000`);
    });
    app.post('/cancel', async (req, res) => {
      const result = await ordersCollection.deleteOne({
        tran_id: req.body.tran_id,
      });

      res.redirect(`http://localhost:5000`);
    });
    app.post('/ipn', (req, res) => {
      console.log(req.body);
      res.send(req.body);
    });
    app.post('/validate', async (req, res) => {
      const result = await ordersCollection.findOne({
        tran_id: req.body.tran_id,
      });

      if (result.val_id === req.body.val_id) {
        const update = await ordersCollection.updateOne(
          { tran_id: req.body.tran_id },
          {
            $set: {
              paymentStatus: 'paymentComplete',
            },
          }
        );
        console.log(update);
        res.send(update.modifiedCount > 0);
      } else {
        res.send('Chor detected');
      }
    });
    app.get('/orders/:tran_id', async (req, res) => {
      const id = req.params.tran_id;
      const result = await ordersCollection.findOne({ tran_id: id });
      res.json(result);
    });

    // get all products
    app.get('/products', async (req, res) => {
      const cursor = productsCollection.find({});
      const result = await cursor.toArray();
      res.json(result);
    });

    // get all orders
    app.get('/orders', async (req, res) => {
      const cursor = ordersCollection.find({});
      const result = await cursor.toArray();

      res.json(result);
    });

    // add a product

    app.post('/products', async (req, res) => {
      const data = req.body;
      const result = await productsCollection.insertOne(data);

      res.json(result);
    });

    // update order status

    app.put('/orders/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };

      const updateDoc = {
        $set: {
          status: 'shipped',
        },
      };
      const result = await ordersCollection.updateOne(filter, updateDoc);
      res.json(result);
    });

    // get single user orders
    app.get('/orders/:email', async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const cursor = ordersCollection.find(query);
      const result = await cursor.toArray();

      res.json(result);
    });

    // check is admin
    app.get('/users/admin/:email', async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);

      res.json(user);
    });

    // get all reviews
    app.get('/reviews', async (req, res) => {
      const cursor = reviewsCollection.find({});
      const result = await cursor.toArray();

      res.json(result);
    });

    // add an user 'POST'
    app.post('/users', async (req, res) => {
      const data = req.body;
      const result = await usersCollection.insertOne(data);

      res.json(result);
    });

    // add an user 'PUT'
    app.put('/users', async (req, res) => {
      const data = req.body;
      const filter = { email: data.email };
      const options = { upsert: true };

      const updateDoc = {
        $set: {
          email: data.email,
          displayName: data.displayName,
        },
      };
      const result = await usersCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      res.json(result);
    });
    // add an admin

    app.put('/users/:email', async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email: email });
      console.log(email);
      const filter = { email: email };

      const updateDoc = {
        $set: {
          role: 'admin',
        },
      };
      const result = await usersCollection.updateOne(filter, updateDoc);
      // const result = await usersCollection.insertOne(data);

      res.json(result);
    });

    // add an review data
    app.post('/reviews', async (req, res) => {
      const data = req.body;
      const result = await reviewsCollection.insertOne(data);

      res.json(result);
    });

    // place an order data
    app.post('/order', async (req, res) => {
      const data = req.body;
      const result = await ordersCollection.insertOne(data);

      res.json(result);
    });

    // remove an order
    app.delete('/orders/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await ordersCollection.deleteOne(query);
      res.json(result);
    });

    // remove an product
    app.delete('/products/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await productsCollection.deleteOne(query);
      res.json(result);
    });

    // stripe payment gateway
    app.post('/create-payment-intent', async (req, res) => {
      const paymentInfo = req.body;
      const amount = paymentInfo.price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        currency: 'usd',
        amount: amount,
        payment_method_types: ['card'],
      });
      res.json({ clientSecret: paymentIntent.client_secret });
    });
  } catch {}
}

run().catch(console.dir);

client.connect((err) => {
  const collection = client.db('test').collection('devices');
  // perform actions on the collection object
  //   client.close();
});

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});
