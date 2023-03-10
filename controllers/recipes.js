const express = require('express')
const axios = require('axios');
const db = require('../models')
const router = express.Router()
require('dotenv').config()
api_key = process.env.API_KEY

//browse recipes
router.get('/', async (req, res) => {
    try {
        const recipes = await db.recipe.findAll({
            include: [db.user]
        })
        res.render('recipes/browse.ejs', {recipes: recipes})
    }catch (err){
        console.log(err)
        res.status(400).render('main/404')
    }
    
})
//create recipe
router.get('/new', async (req, res) => {
    try {
        if(res.locals.user != null){
            res.render('recipes/new.ejs')
        } else {
            res.send(`log in to create a recipe`)
        }
       
    }catch (err) {
        console.log(err)
        res.status(400).render('main/404')
    }
})

//view specific recipe page
router.get('/:id', async (req, res) => {
    try {
        let recipe = await db.recipe.findOne({
            where: { id: req.params.id },
            include: [db.user, db.ingredient]
        })
        //take ingredients and quantity list from recipe and combine them into 1 array
        let ingredients = recipe.dataValues.ingredient_list.split(',')
        let quantities = recipe.dataValues.quantities.split(',')
        let combined = []
        for (let i = 0; i <ingredients.length; i++){
            combined.push(quantities[i]+' '+ingredients[i])
        }
    

        res.render('recipes/recipe.ejs', {recipe: recipe, combined: combined})
    }catch (err) {
        console.log(err)
        res.status(400).render('main/404')
    }
   
})

//create recipe
router.post('/', async (req,res) => {
    try{
        // create recipe in db with form inputs
        let [post, postCreated] = await db.recipe.findOrCreate({
            where:{
                userId: req.body.userId,
                recipe_name: req.body.recipe_name,
                cook_time: req.body.cook_time,
                servings: req.body.servings,
                description: req.body.description,
                ingredient_list: req.body.ingredient_list,
                quantities: req.body.quantities,
                instructions: req.body.instructions
            }
        })
        console.log(req.body.ingredient_list)
        //take comma separated list of ingredients (req.body.ingredient_list) and create an array, pop the last empty index
        let ingredientArray = req.body.ingredient_list.split(',')
        console.log(ingredientArray)

        // loop through ingredient array and make an api call

        for(let i = 0; i<ingredientArray.length; i++) {
            let response = await axios.get(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${api_key}&query=${ingredientArray[i]}&pageSize=1&dataType=Survey (FNDDS)`)
            //information I need to populate ingredient model (comma separated string of fdcIDs for the first 3 foods that show up from the response.data)
            //api was much slower than expected for multiple fdcId food search (had to go down to one fdcID per ingredient)
            let foodsArray = response.data.foods
            console.log(foodsArray)
            // let fdcIDList = ''
            // foodsArray.forEach(function(food) {
            //     fdcIDList = fdcIDList + food.fdcId + ','
                
            // })
            // fdcIDList = fdcIDList.substring(0, fdcIDList.length-1)

            let fdcIDList = foodsArray[0].fdcId.toString()


            //create ingredient in db
            let [ingredientPost, ingredientPostCreated] = await db.ingredient.findOrCreate({
                where: {
                    ingredient_name: response.data.foodSearchCriteria.generalSearchInput,
                    fdcID: fdcIDList
                }
            })
            // console.log(ingredientPost)

            //create the N:M relationship
            await ingredientPost.addRecipe(post)
            
        }

        res.redirect(`/recipes`)

    }catch (err) {
        console.log(err)
        res.status(400).render('main/404')
    }
})


//get form to edit specific recipe
router.get('/:id/edit', async (req,res) =>{
    try {
        
        let foundRecipe = await db.recipe.findOne({
            where:{
                id: req.params.id
            },
            include: [db.user, db.ingredient]
            
        })

    
        //combined array for quantities and ingredients
        let ingredients = foundRecipe.dataValues.ingredient_list.split(',')
        let quantities = foundRecipe.dataValues.quantities.split(',')
        
        
        //check to make sure user is authorized to render page (even if they manually type the route)
        if(res.locals.user.dataValues.username === foundRecipe.user.username){
            res.render('recipes/edit.ejs', {recipe: foundRecipe, ingredientsArray:ingredients, quantitiesArray:quantities})
        } else {
            res.send(`User:${res.locals.user.username} is not authorized to edit this recipe`)
        }


    }catch (err) {
        console.log(err)
        res.status(400).render('main/404')
    }
})


//update a recipe
router.put('/:id', async(req, res) => {
    try{
        // console.log(req.body)

        //delete join table relationships
        const numRowsDeleted = await db.recipes_ingredients.destroy({
            where:{recipeId: req.params.id}
        })
        
        //INGREDIENTS UPDATE
        for(let i = 0; i<req.body.ingred.length; i++){
            //find the ingredient at index i
            let foundIngredient = await db.ingredient.findOne({
                where:{ingredient_name: req.body.ingred[i]}
            })
            //separate findOne cause I deleted the associations above
            let foundRecipe = await db.recipe.findOne({
                where:{id: req.params.id}
            })
            //this is a case if someone replaced one of the ingredients with one that isnt in the ingredients database
            if(foundIngredient === null){
                let response =await axios.get(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${api_key}&query=${req.body.ingred[i]}&pageSize=1&dataType=Survey (FNDDS)`)
                //storing the ingredient with its name and fdcID
                let foodsArray = response.data.foods
                let fdcIDList = foodsArray[0].fdcId.toString()
                let [ingredientPost, ingredientPostCreated] = await db.ingredient.findOrCreate({
                    where: {
                        ingredient_name: response.data.foodSearchCriteria.generalSearchInput,
                        fdcID: fdcIDList
                    }
                })
                //then make the association
                await ingredientPost.addRecipe(foundRecipe)
            } else {
                //add association of found ingredient
                await foundIngredient.addRecipe(foundRecipe)
            }
        }

        //RECIPE UPDATE
        const numRowsChanged = await db.recipe.update({recipe_name:req.body.recipe_name, cook_time:req.body.cook_time, servings:Number(req.body.servings), description:req.body.description, ingredient_list:req.body.ingred.join(), quantities:req.body.quan.join(), instructions:req.body.instructions},{
            where: {
                id: req.params.id
            }
        })
        res.redirect(`/recipes/${req.params.id}`)

    }catch (err) {
        console.log(err)
        res.status(400).render('main/404')
    }
})



//delete a recipe
router.delete('/:id', async (req, res) => {
    try{
        //delete join table relationships
        const recipeNumRowsDeleted = await db.recipes_ingredients.destroy({
            where:{
                recipeId: req.params.id
            }
        })
        //delete recipe with the name from form hidden input
        const numRowsDeleted = await db.recipe.destroy({
            where:{
                recipe_name:req.body.recipe_name
            }
        })
        res.redirect('/recipes')

    }catch (err) {
        console.log(err)
        res.status(400).render('main/404')
    }
})

//main api call (sadly really inconsistent speed. most of the time takes super long even for only 3-4 fdcids)
router.get('/:id/ingredients', async (req, res) => {
    try {
        //find the recipe 
        let foundRecipe = await db.recipe.findOne({
            where: { id: req.params.id },
            include: [db.user, db.ingredient]
        })

        //take all ingredients' fdcids and turn them into comma separated string for the api call
        let fdcIDlist = ''
        for(let i = 0; i<foundRecipe.ingredients.length; i++) {
            fdcIDlist = fdcIDlist + foundRecipe.ingredients[i].dataValues.fdcID + ','
        }
        fdcIDlist = fdcIDlist.substring(0, fdcIDlist.length-1)
        // console.log(fdcIDlist)

        let response = await axios.get(`https://api.nal.usda.gov/fdc/v1/foods?api_key=${api_key}&fdcIds=${fdcIDlist}`)

        res.render('recipes/ingredients.ejs', {foundRecipe: foundRecipe, response: response})
    }catch (err) {
        console.log(err)
        res.status(400).render('main/404')
    }
})

//search bar route to search for recipe
router.post('/search', async (req, res) => {
    try{
        let foundRecipe = await db.recipe.findOne({
            where: {recipe_name: req.body.recipeName}
        })
        if (foundRecipe != null){
            res.redirect(`/recipes/${foundRecipe.id}`)
        } else {
            res.send('No recipe found')
        }
        
    }catch (err) {
        console.log(err)
        res.status(400).render('main/404')
    }
})


module.exports = router