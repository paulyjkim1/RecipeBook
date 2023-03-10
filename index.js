//required packages
require('dotenv').config()
const express = require('express')
const cookieParser = require('cookie-parser')
const db = require('./models')
const crypto = require('crypto-js')
const methodOverride = require("method-override")


//app config
const app = express()
const PORT = process.env.PORT || 8000
app.set('view engine', 'ejs')
// parse request bodies from the html forms
app.use(express.urlencoded({ extended: false }))
// tell express to parse incoming cookies
app.use(cookieParser())
app.use(methodOverride('_method'))
app.use(express.static('public'));

//custom auth middleware that checks teh cookies for a user id and if it finds one then look up the user in the db
//tell all downstream routes about this user
app.use(async (req, res, next) => {
    try{
        if(req.cookies.userId){
            // decrypt the user id and turn it into a string
            const decryptedId = crypto.AES.decrypt(req.cookies.userId, process.env.SECRET)
            const decryptedString = decryptedId.toString(crypto.enc.Utf8)
            //the user is logged in, lets find them in the db 
            const user = await db.user.findByPk(decryptedString)
            //mount the logged in user on the res.locals
            res.locals.user = user
        } else {
            res.locals.user = null
        }
        //move on to the next middleware/route
        next()
    }catch(err){
        console.log('error in auth middlewars: 🔥', err)
        res.locals.user = null
        next()
    }
})

//example custom middleware
app.use((req, res, next) => {
    // our code goes here
    // console.log('hello from inside of the middleware')
    console.log(`incoming request: ${req.method} - ${req.url}`)

    //res.locals are a place where we an put data to share with downstream routes
    // res.locals.myData = 'hello I am data'

    //invoke next to tell express to go to the next route or middleware
    next()
})


//routes and controllers
app.get('/about', (req, res) => {
    
    res.render('home.ejs', {
        user: res.locals.user
    })
})
app.get('/', (req, res) => {
    
    res.render('entry.ejs', {
        user: res.locals.user
    })
})

app.use('/users', require('./controllers/users'))

app.use('/recipes', require('./controllers/recipes'))

app.listen(PORT, () => {
    console.log(`authenticating on PORT ${PORT}`)
})