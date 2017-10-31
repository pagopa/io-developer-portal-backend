'use strict';

var dotenv = require('dotenv');
dotenv.config({path: 'local.env'});

var express = require('express');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var methodOverride = require('method-override');
var passport = require('passport');
var config = require('./local.config');

var OIDCStrategy = require('passport-azure-ad').OIDCStrategy;

/******************************************************************************
 * Set up passport in the app 
 ******************************************************************************/

//-----------------------------------------------------------------------------
// Use the OIDCStrategy within Passport.
// 
// Strategies in passport require a `verify` function, which accepts credentials
// (in this case, the `oid` claim in id_token), and invoke a callback to find
// the corresponding user object.
// 
// The following are the accepted prototypes for the `verify` function
// (1) function(iss, sub, done)
// (2) function(iss, sub, profile, done)
// (3) function(iss, sub, profile, access_token, refresh_token, done)
// (4) function(iss, sub, profile, access_token, refresh_token, params, done)
// (5) function(iss, sub, profile, jwtClaims, access_token, refresh_token, params, done)
// (6) prototype (1)-(5) with an additional `req` parameter as the first parameter
//
// To do prototype (6), passReqToCallback must be set to true in the config.
//-----------------------------------------------------------------------------
passport.use(new OIDCStrategy({
    identityMetadata: config.creds.identityMetadata,
    clientID: config.creds.clientID,
    responseType: config.creds.responseType,
    responseMode: config.creds.responseMode,
    redirectUrl: config.creds.redirectUrl,
    allowHttpForRedirectUrl: config.creds.allowHttpForRedirectUrl,
    clientSecret: config.creds.clientSecret,
    validateIssuer: config.creds.validateIssuer,
    isB2C: config.creds.isB2C,
    issuer: config.creds.issuer,
    passReqToCallback: config.creds.passReqToCallback,
    scope: config.creds.scope,
    loggingLevel: config.creds.loggingLevel,
    nonceLifetime: config.creds.nonceLifetime,
    nonceMaxAmount: config.creds.nonceMaxAmount,
    useCookieInsteadOfSession: config.creds.useCookieInsteadOfSession,
    cookieEncryptionKeys: config.creds.cookieEncryptionKeys,
    clockSkew: config.creds.clockSkew,
  },
  function(iss, sub, profile, accessToken, refreshToken, done) {
    console.log('profile', profile);
    if (!sub) {
      return done(new Error("No user id found"));
    }
    profile.oid = sub;
    return done(null, profile);
  }
));

//-----------------------------------------------------------------------------
// Config the app, include middlewares
//-----------------------------------------------------------------------------
var app = express();

// app.use(express.logger());

app.use(methodOverride());

app.use(cookieParser());

app.use(bodyParser.urlencoded({ extended : true }));

app.use(passport.initialize());

app.use(app.router);

//-----------------------------------------------------------------------------
// Set up the route controller
//
// 1. For 'login' route and 'returnURL' route, use `passport.authenticate`. 
// This way the passport middleware can redirect the user to login page, receive
// id_token etc from returnURL.
//
// 2. For the routes you want to check if user is already logged in, use 
// `ensureAuthenticated`. It checks if there is an user stored in session, if not
// it will call `passport.authenticate` to ask for user to log in.
//-----------------------------------------------------------------------------

function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) { return next(); }
  res.redirect('/login');
};

const verifier = function(req, res, next) {
  passport.authenticate('azuread-openidconnect', 
    { 
      session: false,
      response: res,
      failureRedirect: '/'
    }
  )(req, res, next);
};

const callback = function(method, redirectUrl) {
  return function(req, res) {
    console.log(method + 'was called with authenticated state = ', req.isAuthenticated());
    res.redirect(redirectUrl);
  }
};

app.get('/', (req, res) => { res.render('index', { user: req.user }); });

app.get('/login', verifier, callback('login', config.apim_url));
app.get('/auth/openid/return', verifier, callback('openid-get', config.apim_url));
app.post('/auth/openid/return', verifier, callback('openid-post', config.apim_url));

app.get('/logout', function(req, res) {
  req.logOut();
  res.redirect(config.destroySessionUrl);
});

console.log("Navigate to http://localhost:3000/login/?p=" + process.env.POLICY_NAME);
app.listen(3000);
