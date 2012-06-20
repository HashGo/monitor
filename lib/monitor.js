var os = require('os'),
    util = require('util'),
    winston = require('winston'),
    StatsD = require('node-statsd').StatsD,
    DataDog = require('datadog')
    //config = require('../../config'),
    dgram = require('dgram');

var monitor = exports;

monitor.config = {};

monitor.setConfig = function(configuration){
  this.config = configuration;
  this.statsd = new StatsD(this.config.stats_server, this.config.stats_port);
  this.ddog   = new DataDog(this.config.DATADOG_API_KEY, this.config.DATADOG_APP_KEY );

  //setup winston default log
  //winston.add(require('winston-graylog2').Graylog2, {graylogHost: this.config.log_server});
}

monitor.setEnv = function(env){
  this.config.env = env;
}

monitor.addLogTransport = function(transport, options){
  winston.add(transport, options);
}

monitor.sendNote = function(note){
  monitor.send(note.level, note.log, note.stat);
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
  
  //send stats if not dev or if collectStats flag is on
  if(stats && (!this.config.dev_env || this.config.collectStats)){
    if (!(stats instanceof Array)){
      stats = [stats];
    }

    stats.forEach(function(stat){
      var key = self.config.appname + '.' + stat.key;
      switch(stat.type){
        case 'counter':
          monitor.statsd.update_stats(key, stat.value || 1);
          self.sendMetricToDDog("counter", key, stat.value || 1 );
          break;
        case 'timer':
          monitor.statsd.timing(key, stat.value);
          self.sendMetricToDDog("gauge", key, stat.value);
          break;
      }
      
      self.sendStat(stat);
    });
  }
}

monitor.sendMetricToDDog = function(type, key, value) {

  var counters = {
    "series": [{
      "metric": key,
      "host": os.hostname(),
      "points": [
        [Date.now(), value]
      ],
      "type": type,
      "tags": [this.config.appname, this.config.env]
    }]
  };

  ddog.postSeries(counters, function(error, response, body) {
    if (response.statusCode >= 200 && response.statusCode < 300) {
      winston.log("debug", util.format("Stat [ %s => %s, %s] sent to DDog", os.hostname(), key, value));
    } else {
      winston.log("warn", util.format("Unexpected Code [%s] while sending stat [ %s => %s, %s] to DDog.", response.statusCode, os.hostname(), key, value));
    }
  });
}



//send the JSON message to the stats server running on log.hashgo.com port 41234
monitor.sendStat = function (stat){
  stat.appName = this.config.appname;
  stat.env = this.config.env;
  stat = new Buffer(JSON.stringify(stat));
  var client = dgram.createSocket("udp4");
  client.send(stat, 0, stat.length, 41234, this.config.hashgo_stats_server, function(err, bytes) {
    client.close();
  });
}
