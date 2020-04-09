var fs = require('fs-extra');
var shell = require('shelljs');
var session = require('cookie-session');
var bodyParser = require('body-parser');
var urlencodedParser = bodyParser.urlencoded({extended: false});

var express = require('express');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io').listen(server);

app.use(express.static(__dirname + '/assets/'));


var install = false;
var build = false;
var data = {
	remote: false,
	framway: false,
	status: 'install',
};


const { JSDOM } = require("jsdom");
var dom;
var getFramway = function(){
	console.log('\n### getFramway');
	return new Promise(function(resolve,reject){
		dom = JSDOM.fromFile('./src/framway/build/index.html',{ runScripts: "dangerously", resources: 'usable' }).then(dom => {
			dom.window.onload = () => { 
				resolve(dom.window.app);
			};
		}).catch(function(e){
			reject(e);
		});
	});
}

var getRemoteRepos = function(){
	var result = {components: [], themes: []};
	var remoteRepos = shell.exec('hub api users/SeptimusVII/repos',{silent:true});
	for(var repo of JSON.parse(remoteRepos)){
		var repoName = repo.full_name.split('/')[1];
		if(repoName.indexOf('framway-component') != -1){
			result.components.push({
				'name_full': repoName,
				'name_short': repoName.replace('framway-component-','')
			})
		}
		if(repo.full_name.split('/')[1].indexOf('framway-theme') != -1){
			result.themes.push({
				'name_full': repoName,
				'name_short': repoName.replace('framway-theme-','')
			})
		}
	}
	return result;
} 

var updateStatus = function(){
	install 	= fs.existsSync('./src/framway/');
	build   	= fs.existsSync('./src/framway/build/');
	data.status = (install?(build?'ok':'build'):'install');
}

var rewriteConfigFile = function(config){
	console.log('\n### rewriteConfigFile');
	return new Promise(function(resolve,reject){
	    resolve();
	});
}

app
.get('/app/install', function(req, res) {
	console.log('\n### install');
	if (!install) {
		shell.cd('src');
		shell.exec('git clone git@github.com:SeptimusVII/framway.git framway');
		shell.cd('framway');
		shell.exec('npm install');
		shell.exec('npm run framway init');
		shell.cd('../..');
	}
	res.redirect('/app');
})
.get('/app', function(req, res) {
	console.log('\n### main page');
    res.render('page.ejs');
})
.use(function(req, res, next){
	res.redirect('/app');
})


io.sockets.on('connection',function(socket){
	console.log('\n### socket connected');
	socket.emit('connected');

	// INIT START
	updateStatus();
	data.remote = getRemoteRepos();
	if (build) {
		getFramway().then(function(framway){
			data.framway = framway;
			socket.emit('update',data);
		}).catch(function(e){
			console.log('getFramway error:',e);
			socket.emit('update',data);
		});
	} else
		socket.emit('update',data);
	// INIT END

	socket.on('action',function(action,config){
		console.log('\n### action',action);
		if (action == 'build' && install) {
			rewriteConfigFile(config).then(function(){
				shell.cd('src/framway');
				shell.exec('npm run build',{silent:true});
				shell.cd('../..');
				updateStatus();
				getFramway().then(function(framway){
					data.framway = framway;
					socket.emit('update',data);
				}).catch(function(e){
					console.log('getFramway error:',e);
					socket.emit('update',data);
				});
			}).catch(function(e){
				console.log('rewriteConfigFile error:',e);
				socket.emit('update',data);
			});
		}
		if (action == 'reset' && install) {
			shell.rm('-rf','src/framway');
			socket.emit('reload');
		}
	});
})

server.listen(666);
