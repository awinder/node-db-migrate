var async = require('async');
var dbmUtil = require('./util');
var Migration = require('./migration');
var log = require('./log');

Migrator = function(driver, migrationsDir) {
  this.driver = driver;
  this.migrationsDir = migrationsDir;
};

Migrator.prototype = {
  createMigrationTable: function(callback) {
    this.driver.createMigrationTable(callback);
  },

  writeMigrationRecord: function(migration, callback) {
    function onComplete(err) {
      if (err) {
        log.error(migration.name, err);
      } else {
        log.info('Processed migration', migration.name);
      }
      callback(err);
    }
    this.driver.addMigrationRecord(global.matching + '/' + migration.name, onComplete);
  },

  deleteMigrationRecord: function(migration, callback) {
    function onComplete(err) {
      if (err) {
        log.error(migration.name, err);
      } else {
        log.info('Processed migration', migration.name);
      }
      callback(err);
    }
    this.driver.deleteMigration(global.matching + '/' + migration.name, onComplete);
  },

  up: function(funcOrOpts, callback) {
    if (dbmUtil.isFunction(funcOrOpts)) {
      funcOrOpts(this.driver, callback);
    } else {
      this.upToBy(funcOrOpts.destination, funcOrOpts.count, callback);
    }
  },

  down: function(funcOrOpts, callback) {
    if (dbmUtil.isFunction(funcOrOpts)) {
      funcOrOpts(this.driver, callback);
    } else {
      this.downToBy(funcOrOpts.count, callback);
    }
  },

  upToBy: function(partialName, count, callback) {
    var self = this;
    Migration.loadFromFilesystem(self.migrationsDir, function(err, allMigrations) {
      if (err) { callback(err); return; }

      Migration.loadFromDatabase(self.migrationsDir, self.driver, function(err, completedMigrations) {
        if (err) { callback(err); return; }
        var toRun = dbmUtil.filterUp(allMigrations, completedMigrations, partialName, count);

        if (toRun.length === 0) {
          log.info('No migrations to run');
          callback(null);
          return;
        }

        async.forEachSeries(toRun, function(migration, next) {
          log.verbose('preparing to run up migration:', migration.name);
          self.driver.startMigration(function() {
            self.up(migration.up.bind(migration), function(err) {
              if (err) { callback(err); return; }
              self.writeMigrationRecord(migration, function() { self.driver.endMigration(next); });
            });
          });
        }, callback);
      });
    });
  },

  downToBy: function(count, callback) {
    var self = this;
    Migration.loadFromDatabase(self.migrationsDir, self.driver, function(err, completedMigrations) {
      if (err) { return callback(err); }

      var toRun = dbmUtil.filterDown(completedMigrations, count);

      if (toRun.length === 0) {
        log.info('No migrations to run');
        callback(null);
        return;
      }

      async.forEachSeries(toRun, function(migration, next) {
        log.verbose('preparing to run down migration:', migration.name);
        self.down(migration.down.bind(migration), function(err) {
          if (err) { callback(err); return; }
          self.deleteMigrationRecord(migration, next);
        });
      }, callback);
    });
  }
};

module.exports = Migrator;
