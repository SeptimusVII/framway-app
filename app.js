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
	status: 'no-install',
};

const { JSDOM } = require("jsdom");
var vDom;

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
});

io.sockets.on('connection',function(socket){
	console.log('\n### socket connected');
	socket.emit('connected');
	// ACTIONS DISPATCHER START
	socket.on('action',function(action,params){
		console.log('\n### Dispatch action: '+action);
		if (action == 'test') {
			sendLogs('Running test function..','update',true);
			try{
				console.log('test component');
				var req = require('./src/framway/src/components/test/test.js')(data.framway);
				console.log(req);
				console.log('###\n ');
			} catch(e){
				console.log(e);
			}
			// installComponents(['block-std','test','btn-load','tabs']).then(function(){
			// 	console.log('updating frontend');
			// 	socket.emit('update',data);
			// });
			setTimeout(function(){
				socket.emit('update',data);
			},1000)
		}
		if (action == 'build' && install) {
			rewriteConfigFile(params).then(function(){
				checkInstall(params).then(function(){
					sendLogs('start building framway...','build',true);
					shell.cd('src/framway');
					shell.exec('npm run build',{silent:true});
					shell.cd('../..');
					sendLogs('end building framway');
					updateStatusVars();
					getCurrentFramway().then(function(framway){
						data.framway = framway;
						updateRemoteInfos();
						sendLogs('updating frontend');
						socket.emit('update',data);
					}).catch(function(e){
						console.log('getCurrentFramway error:',e);
						socket.emit('update',data);
					});
				}).catch(function(e){
					console.log('checkInstall error:',e);
					socket.emit('update',data);
				});
			}).catch(function(e){
				console.log('rewriteConfigFile error:',e);
				socket.emit('update',data);
			});
		}
		if (action == 'updateComponent' && install) {
			installComponent(params).then(function(){
				console.log('updating frontend');
				socket.emit('update',data);
			});
		}
		if (action == 'updateComponents' && install) {
			installComponents(Object.keys(data.remote.components)).then(function(){
				console.log('updating frontend');
				socket.emit('update',data);
			});
		}
		if (action == 'updateTheme' && install) {
			installTheme(params).then(function(){
				console.log('updating frontend');
				socket.emit('update',data);
			});
		}
		if (action == 'updateThemes' && install) {
			installThemes(Object.keys(data.remote.themes)).then(function(){
				console.log('updating frontend');
				socket.emit('update',data);
			});
		}
		if (action == 'delete' && install) {
			console.log('deleting framway\'s directory');
			shell.rm('-rf','src/framway');
			socket.emit('reload');
		}
	});
	// ACTIONS DISPATCHER END

	// FUNCTIONS START
	var sendLogs = function(msg,action=false,sendToApp=false){
		if(action)
			console.log('\n### '+action);
		console.log(msg);
		if (sendToApp)
			socket.emit('updateStatus',action,msg);
	};

	var getCurrentFramway = function(){
		console.log('\n### getCurrentFramway');
		return new Promise(function(resolve,reject){
			vDom = JSDOM.fromFile('./src/index.html',{ runScripts: "dangerously", resources: 'usable' }).then(dom => {
				vDom = dom;
				dom.window.onload = () => { 
					resolve(dom.window.app);
				};
			}).catch(function(e){
				reject(e);
			});
		});
	};

	var getRemoteRepos = function(){
		var result = {components: {}, themes: {}};
		var remoteRepos = shell.exec('hub api users/SeptimusVII/repos',{silent:true});
		for(var repo of JSON.parse(remoteRepos)){
			// console.log(repo);
			var objRepo = {
				'name_full': repo.name,
				'name_short': repo.name.replace('framway-component-','').replace('framway-theme-',''),
				'url': repo.url,
				'description' : repo.description,
			};
			if(repo.name.indexOf('framway-component') != -1)
				result.components[objRepo.name_short] = objRepo;
			if(repo.name.indexOf('framway-theme') != -1)
				result.themes[objRepo.name_short] = objRepo;
		}
		return result;
	}; 

	var updateRemoteInfos = function(){
		console.log('\n### updateRemoteInfos');
		for(var component of data.framway.components){
			console.log('component: '+ component);
			try{
				var objComponent = require('./src/framway/src/components/'+component+'/'+component+'.js')(data.framway);
				console.log(objComponent);
			} catch(e){
				console.log('!!! failed');
			}
			// if (vDom.window.app[getClassName(component)]) {
			// 	var infos = vDom.window.app[getClassName(component)];
			// 	data.remote.components[component].createdAt  = infos.createdAt || false;
			// 	data.remote.components[component].lastUpdate = infos.lastUpdate || false;
			// 	data.remote.components[component].version 	 = infos.version || false;
			// 	data.remote.components[component].loadingMsg = infos.loadingMsg || false;
			// 	data.remote.components[component].requires 	 = infos.requires || false;
			// }
		}
	};

	var updateStatusVars = function(){
		install 	= fs.existsSync('./src/framway/');
		build   	= fs.existsSync('./src/framway/build/');
		data.status = (install?(build?'ok':'no-build'):'no-install');
	};

	var getClassName = function(str){
		var className = '';
	    for (var i in str.split('-')) {
	      className += str.split('-')[i].charAt(0).toUpperCase() + str.split('-')[i].slice(1);
	    }
	    return className;
	};

	var rewriteConfigFile = function(config){
		console.log('\n### rewriteConfigFile');
		return new Promise(function(resolve,reject){
			var strConfig = 'module.exports = '+ JSON.stringify(config);
		    if(strConfig != fs.readFileSync('./src/framway/framway.config.js', 'utf8')){
			    fs.unlinkSync("./src/framway/framway.config.js");
			    fs.appendFileSync("./src/framway/framway.config.js",strConfig);
			    console.log('framway\'s config rewritten \n');
			} else {
			    console.log('framway\'s config not rewritten \n');
			}
	    	resolve();
		});
	};

	var installComponent = function(component){
		sendLogs('installing component '+component+'...','installComponent',true);
		return new Promise(function(resolve,reject){
			shell.cd('src/framway');
			shell.exec('npm run component '+component+' get',{silent:true},function(){
		    	shell.cd('../..');
			    console.log('component '+component+' installed.');
			    resolve();
			});
		});
	};
	var installComponents = function(arrComponents){
		return new Promise(async function(resolve,reject){
		    var arrPromises = [];
		    for(var component of arrComponents)
		    	arrPromises.push(await installComponent(component));
		    Promise.all(arrPromises).then(resolve);
		});
	};
	var installTheme = function(theme){
		sendLogs('installing theme '+theme+'...','installTheme',true);
		return new Promise(function(resolve,reject){
			shell.cd('src/framway');
			shell.exec('npm run theme '+theme+' get',{silent:true},function(){
		    	shell.cd('../..');
			    console.log('theme '+theme+' installed.');
			    resolve();
			});
		});
	};
	var installThemes = function(arrThemes){
		return new Promise(function(resolve,reject){
		    var arrPromises = [];
		    for(var theme of arrThemes)
		    	arrPromises.push(installTheme(theme));
		    Promise.all(arrPromises).then(resolve);
		});
	};
	var checkInstall = function(config){
		console.log('\n### checkInstall');
		return new Promise(function(resolve,reject){
			var arrPromises = [];
		    for(var component of config.components){
		    	console.log('checking existence of component '+component,fs.existsSync('./src/framway/src/components/'+component));
		    	if (!fs.existsSync('./src/framway/src/components/'+component))
		    		arrPromises.push(installComponent(component));
		    }
		    for(var theme of config.themes){
		    	console.log('checking existence of theme '+theme,fs.existsSync('./src/framway/src/themes/'+theme));
		    	if (!fs.existsSync('./src/framway/src/themes/'+theme))
		    		arrPromises.push(installTheme(theme));
		    }
		    Promise.all(arrPromises).then(resolve);
		});
	};
	// FUNCTIONS END

	// INIT START
	updateStatusVars();
	data.remote = getRemoteRepos();
	if (build) {
		getCurrentFramway().then(function(framway){
			data.framway = framway;
			updateRemoteInfos();
			console.log('updating frontend');
			socket.emit('update',data);
		}).catch(function(e){
			console.log('getCurrentFramway error:',e);
			socket.emit('update',data);
		});
	} else{
		socket.emit('update',data);
	}
	// INIT END
});

server.listen(666);
