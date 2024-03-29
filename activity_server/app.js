
/*app.js
Jake Levy
Nov 2020

This the activity DB server program (insert and search)
modified to work with Express App.  Express allows us to 
write code that is easier to read and follow by handling
routing automatically for us.  We no longer need long if/else
chains to figure out how to route requests for our applications.

Instead we can create an instance of the Express routing "app" 
and tell it which combination of Routes and HTTP methods 
to which we want it to respond*/
var tracker = require("tracker");
var http = require("http");
var qString = require("querystring");
//this calls the let db={}; and instantiates the db for us
let dbManager = require('./dbManager');
let express = require("express");
let app = express();
var ObjectID = require('mongodb').ObjectId;
//This will take a set of properties that are coming in from a "POST"
//And transform them into a document for inserting into the "activities"
// collection
function docifyActivity(params){
    let doc = { activity: { type: params.activity }, weight: params.weight,
		distance: params.distance, time: params.time, user: params.user};
    return doc;
}

//The same server response from the activity_server lab
//this time it is specifically used for db inserts
function servResp( calories, res){
let page = '<html><head><title>The Activity Server</title></head>'+
'<body> <form method="post">'+
'<h1>Fill out your Activity</h1>'+
'User Name <input name="user"><br>'+
'Activity Name <select name="activity"><option>Running</option><option>Walking</option><option>Swimming</option></select><br>'+
'Weight (in pounds) <input name="weight"><br>' +
'Distance (in miles) <input name="distance"><br>'+
'Time (in minutes) <input name="time"><br>' +
'<input type="submit" value="Insert!">' +
'<input type="reset" value="Clear">'+
'</form>';
    if (calories){
     page+='<div id="calories"><h3> Calories Burned: ' + calories + '</h3></div>';
    }
page+='<br><br><a href="./search">Search</a></body></html>';

return page;
}
//This function is for searching. Because we want the page to finish
//generating before it is returned, this function is labeled async
//so that we can "await" the results of fulfillment for processing all items

//this has the side effect of making this function return a Promise so we
//will access the result using then syntax
async function searchResp(result, response){
let page = '<html><head><title>The Activity Server</title></head>'+
'<body> <form method="post">'+
'<h1>Search for an Activity</h1>'+
'Property <select name="prop">'+
'<option>user</option>' +
'<option>activity.type</option>' +
'<option>weight</option>' +
'<option>distance</option>' +
'<option>time</option>' +
'</select>'+
'  <input name="value">'+
'<input type="submit" value="Search!">' +
'<input type="reset" value="Clear">'+
'</form>';

    if (result){

	page+=`<h2>Activities for ${result.prop}: ${result[result.prop]}</h2>`
	let count = 0;
	//the await must be wrapped in a try/catch in case the promise rejects
	try{
	await result.data.forEach((item) =>{
		let curAct = new tracker(item.activity.type, item.weight, item.distance, item.time);
	    page+=` Activity ${++count}:  <a href="/users/${item.user}">${item.user}</a>  <a href="/activities/${item._id}">Details</a> | ${curAct.calculate()} Calories Burned <br>` ;
	    });
	} catch (e){
	    page+=e.message;
	    throw e;
	}
    }
page+='<br><br><a href="/insert">home/insert</a></body></html>';
  
    return page;
}
var postParams;
function moveOn(postData){
    let proceed = true;
    postParams = qString.parse(postData);
    //handle empty data
    for (property in postParams){
	if (postParams[property].toString().trim() == ''){
	    proceed = false;
	}
    }

    return proceed;
}

//The order of provided routing functions matters.  They work similarly to
//cases in a switch statement.  The first matching route is run.
//the response methods 'send' and 'end' will end the "request response cycle"
//If the cycle is not ended then the request will "hang".
// These are NOT the same methods provided by the standard response object of HTTP
//But instead are methods provided by Express.   A full list of methods that can
//be used to end the cycle
app.set('views', './views');
app.set('view engine', 'pug');

//GET ROUTES
//These callback functions in "Express syntax" are called "middleware" functions.
//They sit "in the middle" between your app's backend end functionality
//(in this case, the simple Activity Class, MongoDB, and/or the local
//"server" filesystem) and the client.  Middleware function's 
app.get('/', function (req, res){
    res.end('<html><body><br><br><a href="/insert">home/insert</a>&emsp;&emsp;<a href="/search">sea\
rch Page</a></body></html>');
});
app.get('/insert', function (req, res){
    let page = servResp(null, res);
    //    res.send(page);
    res.render('insert');
});
//demonstrates error handling with Express
//This error is unlikely but this middleware function demonstrates how to use
//Express to process caught errors.  Passing errors to the "next" function
//allows Express to catch them and do its own error handling

//using the Express Error handler is not required and it really only prints
//a stack trace of the error (the series of called functions that generated
//the error).  But if you want only basic error handling, you can use it
app.get('/search', function(req, res, next){
    searchResp(null, res).then(
	page=> {    res.send(page); }
    ).catch(next);
});
app.param('actID', function(req, res, next, value){
    console.log(`Request for activity ${value}`);
    next();
});
app.get('/users/:userID', async (req, res)=> {
    let users = dbManager.get().collection("users");
    let activities = dbManager.get().collection("activities");

    try{

	let user=await users.findOne({_id: req.params.userID});

	let actCursor = activities.find({ user: req.params.userID});

	let actArr = await actCursor.toArray();
	let current;
	for (item in actArr){
	    current = new tracker(actArr[item].activity.type, actArr[item].weight, actArr[item].distance, actArr[item].time);
	    actArr[item].calories = current.calculate();
	    console.log("Calories: " + current.calculate());
	}
	res.render('user', { searchID: user._id, activities: actArr});
    }catch (err){
	console.log(err.message);
	res.status(500).send("Error 500");
    }

    
    
});
app.get('/activities/:actID', async function(req, res){
   
    let col = dbManager.get().collection("activities");
    try{
	let result = await col.findOne({ _id: ObjectID(req.params.actID) });
	console.log(result);

	res.render('activity', { searchID: result.user, exercise: result.activity.type, distance: result.distance, weight: result.weight })
    }catch(e){
	console.log(e.message);
    }
});
var postData;

//POST ROUTES
app.post('/insert', function(req, res){
    postData = '';
    req.on('data', (data) =>{
	postData+=data;
    });
    req.on('end', async ()=>{
	//Break into functions
	console.log(postData);
	if (moveOn(postData)){
	    let col = dbManager.get().collection("activities");
	    //on the insert page
		try{
		    //if the data is bad, object creation throws an
		    //error (as we have seen since Week 4).
		    //And no document will be inserted
		    var curTracker = new tracker(postParams.activity,
						 postParams.weight,
						 postParams.distance,
						 postParams.time);
		    calories = curTracker.calculate();
		    
		    //convert params to a document for Mongo
		    let curDoc = docifyActivity(postParams);

		    //insert the document into the db
		    let result = await col.insertOne(curDoc);
		    //return calories as response (Success)
//		    let page =  servResp(calories, res);
		    res.render('insert', { calories: calories});
		    console.log(result); //log result for viewing
		} catch (err){
		    calories = "ERROR! Please enter appropriate data";
		    console.log(err.message);
//		    let page = servResp(calories, res);
		    res.render('insert', { calories: calories});
		    //res.send(page);
		}
	} else{ //can't move on
	    calories = "Error! All Fields must have Data";
	    
	    let page =  servResp(calories, res);
	    res.render('insert', { calories: calories});
//	    res.send(page);
	}
    });
    	    
});

app.post('/search', function(req, res){
    postData = '';
    req.on('data', (data) =>{
	postData+=data;
    });
    req.on('end', async ()=>{
	//Break into functions
	console.log(postData);
	if (moveOn(postData)){
	    let col = dbManager.get().collection("activities");
	    var prop= postParams.prop;
	    var val = postParams.value;
	    if (prop != "user" && prop != "activity.type"){
		val = Number(postParams.value);
	    }
	    //simple equality search. using [] allows a variable
	    //in the property name
	    let searchDoc = { [prop] : val };
	    try{
		let cursor = col.find(searchDoc,  {
		    projection: {  activity: 1, distance: 1, user: 1, time: 1, weight: 1}}).sort({distance: -1});
		let resultOBJ={data: cursor, [prop]  : val, prop: prop};

		searchResp(resultOBJ, res).then( page =>
						  {res.send(page)
						  });//call the searchPage
	    } catch (e){
		console.log(e.message);
		res.writeHead(404);
		res.write("<html><body><h1> ERROR 404. Page NOT FOUND</h1>");
		res.end("<br>" + e.message + "<br></body></html>");
	    }
	} else{ // can't move on
	    searchResp(null, res).then(
		page => {res.send(page)}
	);
	}
    });
});
//Routes are loaded *in order*.  Like Switch cases, if a route
//gets matched early then it won't match later routes.  So
//RUNS for any ROUTE not matched to those methods above
app.use('*', function(req, res){
    res.writeHead(404);
    res.end(`<h1> ERROR 404. ${req.url} NOT FOUND</h1><br><br>`);
});


//Express listen function is literally the HTTP server listen method
//so we can do the exact same things with it as before
app.listen(3000, async ()=> {
    //start and wait for the DB connection
    try{
        await dbManager.get("practiceDB");
    } catch (e){
        console.log(e.message);
    }

    console.log("Server is running...");
});
