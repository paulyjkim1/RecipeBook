//create an instance of express routers
const express = require('express')
const { RowDescriptionMessage } = require('pg-protocol/dist/messages')
const db = require('../models')
const router = express.Router()
const crypto = require('crypto-js')
const bcrypt = require('bcrypt')

//mount our routes on the router

// GET /users/new -- serves a form to create a new user
router.get('/new', (req, res) => {
    res.render('users/new.ejs', {
        user: res.locals.user
    })
})

// POST /users -- creates a new user from the form @ /users/new
router.post('/', async (req, res) => {
    try {
        //based on the info in the req.body, find or create user
        const [newUser, created] = await db.user.findOrCreate({
            where: {
                email: req.body.email
            }
        })
        //redirect to the login page if the user is found
        if (!created) {
            console.log('user exists!')
            res.redirect('/users/login?message=Please log in to continue.')
        } else {
            //here we know its a new user
            //hash the supplied password
            const hashedPassword = bcrypt.hashSync(req.body.password, 12)
            //save the user with the new password
            newUser.password = hashedPassword
            await newUser.save() //actually save the new pass in the db
            //encrypt the new user's id and convert it to a string
            const encryptedId = crypto.AES.encrypt(String(newUser.id), process.env.SECRET)
            const encryptedIdString = encryptedId.toString()
            //place the encrypted id in a cookie
            res.cookie('userId', encryptedIdString)
            //redirect to user's profile
            res.redirect('/users/profile')
        }
        
        
    } catch (err) {
        console.log(err)
        res.status(500).send('server error')
    }
})

router.get('/login', (req, res)=> {
    res.render('users/login.ejs', {
        message: req.query.message ? req.query.message : null,
        user: res.locals.user
    })
})
//ingest data from form rendered @ get /users/login
router.post('/login', async (req, res) => {
    try{
        // look up the user based on their email
        const user = await db.user.findOne({
            where: {
                email: req.body.email
            }
        })
        //boilerplate message if login fais
        const badCredentialMessage = 'username or password incorrect'
        if (!user) {
            // if the user isn't found in the db 
            res.redirect('/users/login?message=' + badCredentialMessage)
        } else if (!bcrypt.compareSync(req.body.password, user.password)) {
            // if the user's supplied password is incorrect
            res.redirect('/users/login?message=' + badCredentialMessage)
        } else {
            // if the user is found and their password matches-log them in
            console.log('loggin user in')
            const encryptedId = crypto.AES.encrypt(String(user.id), process.env.SECRET)
            const encryptedIdString = encryptedId.toString()
            res.cookie('userId', encryptedIdString)
            res.redirect('/users/profile')
        }
    }catch (err) {
        console.log(err)
        res.status(500).send('server error')
    }
})

router.get('/logout', (req, res) => {
    // log the user out by removing the cookie
    // make a get req to /
    res.clearCookie('userId')
    res.redirect('/')
})

//get /users/profile -- show user their profile
router.get('/profile', (req, res)=> {
    if (!res.locals.user){
        res.redirect('/users/login?message=You must authenticate before you are authorized to view this resource!')
    } else {
        res.render('users/profile.ejs', {
            user: res.locals.user
        })
    }
})

//export the router 
module.exports = router