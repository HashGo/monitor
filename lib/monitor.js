var winston = require('winston'),
    StatsD = require('node-statsd').StatsD,
    //config = require('../../config'),
    dgram = require('dgram');

var monitor = exports;


//config : {appnName : <?>, env : <?>, stats_server : <?>, stats_port : <?>}
monitor.config = {};

monitor.setConfig = function(configuration){
  this.config = configuration;
  this.statsd = new StatsD(this.config.stats_server, this.config.stats_port);
}

monitor.setEnv = function(env){
  this.config.env = env;
}

monitor.addLogTransport = function(transport, options){
  winston.add(transport, options);
}


/**
 * level: info, warn, error, etc.
 * description: text description that will be logged
 * stats: single stat entry or array of stat entries
 *        each stat entry will have the following:
 *            key: path key for this stat
 *            type: 'counter', 'timer', 'json'
 *            value: stat value
 */
monitor.send = function(level, description, stats){
  //log if necessary
  var self = this;
  if( level && description ){
    winston.log(level, description);
  }
  
  //send stats if not dev
  if(stats /*&& !this.config.dev_env*/){
    if (!(stats instanceof Array)){
      stats = [stats];
    }

    stats.forEach(function(stat){
      var key = self.config.appname + '.' + stat.key;
      switch(stat.type){
        case 'counter':
          monitor.statsd.update_stats(key, stat.value || 1);
          break;
        case 'timer':
          monitor.statsd.timing(key, stat.value);
          break;
        case 'json':
          self.sendStat(stat);
          break;
      }
    });
  }
}

//send the JSON message to the stats server running on log.hashgo.com port 41234
monitor.sendStat = function (stat){
  stat.appName = this.config.appname;
  stat.env = this.config.env;
  stat = new Buffer(JSON.stringify(stat));
  var client = dgram.createSocket("udp4");
  client.send(stat, 0, stat.length, 41234, "log.hashgo.com", function(err, bytes) {
    client.close();
  });
}
