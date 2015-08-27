var Collection = require('../lib/collection');

var MongoClient = require('mongodb').MongoClient;
var db;

module.exports = {
    setUp: function (callback) {
        MongoClient.connect('mongodb://127.0.0.1:27017/test', function (err, database) {
            if (err) {
                console.log(err);
            }
            db = database;
            db.dropDatabase(function () {
                callback();
            });
        });
    },
    tearDown: function (callback) {
        db.close();
        callback();
    },
    testCollection: function (test) {
        test.expect(7);

        var games = new Collection(db, 'games');
        var id;

        games.insert({
            title: 'My title'
        }).then(function (docs) {
            id = docs._id;
            return games.findById(id)
                .then(function (game) {
                    test.strictEqual('My title', game.title);
                });
        }).then(function () {
            return games.findAndModify(id, {
                'title': 'Other title'
            }).then(function (result) {
                test.ok(result);
            });
        }).then(function () {
            return games.findById(id)
                .then(function (game) {
                    test.strictEqual('Other title', game.title);
                });
        }).then(function () {
            return games.findAndModify(id, {
                title: 'Ñor'
            }).then(function (result) {
                test.strictEqual(result.title, 'Ñor');
            });
        }).then(function () {
            return games.findAndUpdate(id, {
                $set: {
                    title: '***'
                },
                $addToSet: {
                    episodes: {
                        $each: [1, 2, 3]
                    }
                }
            }).then(function (result) {
                test.strictEqual(result.title, '***');
                test.deepEqual(result.episodes, [1, 2, 3]);
            });
        }).then(function () {
            return games.removeById(id);
        }).then(function () {
            return games.count().then(function (count) {
                test.strictEqual(count, 0);
            });
        }).fail(function (err) {
            test.ok(false, err.stack);
        }).then(function () {
            test.done();
        });
    },
    testPreremove: function (test) {
        test.expect(2);
        var ids = [];
        var games = new Collection(db, 'games');

        var pre = function (objectID, next) {
            ids.pop();
            next();
        };
        games.preRemove(pre);

        games.insert()
            .then(function (game) {
                ids.push(game._id);
                return games.insert().then(function (game) {
                    ids.push(game._id);
                    return games.insert().then(function (game) {
                        ids.push(game._id);
                    });
                });
            }).then(function () {
                console.log(ids);
                test.strictEqual(3, ids.length);
                return games.remove();
            }).then(function () {
                test.strictEqual(0, ids.length);
            }).fail(function (err) {
                test.ok(false, err.stack);
            }).then(function () {
                test.done();
            });
    },
    testFilter: function (test) {
        test.expect(6);

        var users = new Collection(db, 'users');
        users.setFilter(function (user) {
            delete user.password;
        });
        var userId;

        users.insert({
            name: 'admin',
            password: 'ñor'
        }).then(function (user) {
            userId = user._id;
            test.strictEqual(user.name, 'admin');
            test.strictEqual(user.password, undefined);
        }).then(function () {
            return users.findById(userId);
        }).then(function (user) {
            test.strictEqual(user.name, 'admin');
            test.strictEqual(user.password, undefined);
            return users.findAndModify(userId, {
                name: 'admin2'
            });
        }).then(function (user) {
            test.strictEqual(user.name, 'admin2');
            test.strictEqual(user.password, undefined);
        }).fail(function (err) {
            test.ok(false, err.stack);
        }).then(function () {
            test.done();
        });
    },
    testValidator: function (test) {
        test.expect(3);

        var users = new Collection(db, 'users');

        users.setValidator(function (user, insert) {
            if (insert) {
                var valid = user.name && user.password;
                if (valid) {
                    return users.find({
                        name: user.name
                    }, true).then(function (otherUser) {
                        if (otherUser) {
                            return null;
                        } else {
                            return user;
                        }
                    });
                } else {
                    return null;
                }
            } else {
                for (var key in user) {
                    if (key !== 'password') {
                        return null;
                    }
                }
                return user;
            }
        });

        var userId;

        users.insert({
            name: 'admin'
        }).fail(function (err) {
            console.log(JSON.stringify(err));
            test.ok(err);
            return users.insert({
                name: 'admin',
                password: 'ñor'
            });
        }).then(function (user) {
            userId = user._id;
            return users.findAndModify(user._id, {
                name: 'admin2'
            });
        }).fail(function (err) {
            console.log(JSON.stringify(err));
            test.ok(err);
            return users.findAndModify(userId, {
                password: 'do'
            });
        }).then(function (user) {
            console.log(user);
            test.strictEqual(user.password, 'do');
        }).fail(function (err) {
            test.ok(false, 'Final error: ' + JSON.stringify(err));
        }).then(function () {
            test.done();
        });
    }
};