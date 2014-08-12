var Collection = require('../lib/collection');

var MongoClient = require('mongodb').MongoClient;
var db;

module.exports = {
    setUp: function(callback) {
        MongoClient.connect('mongodb://127.0.0.1:27017/test', function(err, database) {
            if (err) {
                console.log(err);
            }
            db = database;
            callback();
        });
    },
    tearDown: function(callback) {
        db.close();
        callback();
    },
    testCollection: function(test) {
        test.expect(5);

        var games = new Collection(db, 'games');
        var id;

        games.insert({
            title: 'My title'
        }).then(function(objectID) {
            test.ok(objectID);
            id = objectID;
            return games.findById(objectID)
                .then(function(game) {
                    test.strictEqual('My title', game.title);
                });
        }).then(function() {
            return games.setProperty(id, 'title', 'Other title')
                .then(function(result) {
                    test.ok(result);
                });
        }).then(function() {
            return games.findById(id)
                .then(function(game) {
                    test.strictEqual('Other title', game.title);
                });
        }).then(function() {
            return games.removeById(id);
        }).then(function() {
            return games.count().then(function(count) {
                test.strictEqual(count, 0);
            });
        }).fail(function(err) {
            test.ok(false, err);
        }).then(function() {
            test.done();
        });
    }
};