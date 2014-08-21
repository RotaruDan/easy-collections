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
            db.dropDatabase(function() {
                callback();
            });
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
        }).then(function(docs) {
            id = docs._id;
            return games.findById(id)
                .then(function(game) {
                    test.strictEqual('My title', game.title);
                });
        }).then(function() {
            return games.findAndModify(id, {
                'title': 'Other title'
            }).then(function(result) {
                test.ok(result);
            });
        }).then(function() {
            return games.findById(id)
                .then(function(game) {
                    test.strictEqual('Other title', game.title);
                });
        }).then(function() {
            return games.findAndModify(id, {
                title: 'Ñor'
            }).then(function(result) {
                test.strictEqual(result.title, 'Ñor');
            });
        }).then(function() {
            return games.removeById(id);
        }).then(function() {
            return games.count().then(function(count) {
                test.strictEqual(count, 0);
            });
        }).fail(function(err) {
            test.ok(false, err.stack);
        }).then(function() {
            test.done();
        });
    },
    testPreremove: function(test) {
        test.expect(2);
        var ids = [];
        var games = new Collection(db, 'games');

        var pre = function(objectID, next) {
            ids.pop();
            next();
        };
        games.preRemove(pre);

        games.insert()
            .then(function(game) {
                ids.push(game._id);
                return games.insert().then(function(game) {
                    ids.push(game._id);
                    return games.insert().then(function(game) {
                        ids.push(game._id);
                    });
                });
            }).then(function() {
                console.log(ids);
                test.strictEqual(3, ids.length);
                return games.remove();
            }).then(function() {
                test.strictEqual(0, ids.length);
            }).fail(function(err) {
                test.ok(false, err.stack);
            }).then(function() {
                test.done();
            });
    },
    testFilter: function(test) {
        test.expect(6);

        var users = new Collection(db, 'users');
        users.setFilter(function(user) {
            delete user.password;
        });
        var userId;

        users.insert({
            name: 'admin',
            password: 'ñor'
        }).then(function(user) {
            userId = user._id;
            test.strictEqual(user.name, 'admin');
            test.strictEqual(user.password, undefined);
        }).then(function() {
            return users.findById(userId);
        }).then(function(user) {
            test.strictEqual(user.name, 'admin');
            test.strictEqual(user.password, undefined);
            return users.findAndModify(userId, {
                name: 'admin2'
            });
        }).then(function(user) {
            test.strictEqual(user.name, 'admin2');
            test.strictEqual(user.password, undefined);
        }).fail(function(err) {
            test.ok(false, err.stack);
        }).then(function() {
            test.done();
        });
    }
};