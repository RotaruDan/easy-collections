var Q = require('q');
var async = require('async');
var ObjectID = require('mongodb').ObjectID;


var Collection = function (db, name) {
    this.db = db;
    this.name = name;
    this.preRemoves = [];
    this.sort = {};
};


Collection.prototype.collection = function () {
    return this.db.collection(this.name);
};

/**
 * Inserts an object in the collection. Returns a promise with the ObjectID of the recently
 * created object.
 */
Collection.prototype.insert = function (object) {
    object = object || {};
    var that = this;
    return this.validate(object, true).then(function (validated) {
        if (!validated) {
            throw {
                status: 400,
                message: 'Invalid document'
            };
        }

        var deferred = Q.defer();
        that.collection().insertOne(validated || {}, function (err, doc) {
            if (err) {
                deferred.reject(err);
            } else {
                doc = doc.ops[0];
                that.filter(doc).then(function () {
                    deferred.resolve(doc);
                }).fail(function (err) {
                    deferred.reject(err);
                });
            }
        });
        return deferred.promise;
    });
};

/**
 * Removes objects in the collection
 * @param  {Object} where clause
 */
Collection.prototype.remove = function (where) {
    var that = this;
    return this.find(where || {}).then(function (results) {
        var removes = [];
        for (var i = 0; i < results.length; i++) {
            removes.push(that.removeById(results[i]._id));
        }
        return Q.all(removes);
    });
};

/**
 * Removes the object with the given objectID
 * @return {Object} a promise with the result
 */
Collection.prototype.removeById = function (objectID) {
    var that = this;
    return this.executePreRemove(toObjectID(objectID)).then(function () {
        var deferred = Q.defer();
        that.collection().deleteOne({
            _id: toObjectID(objectID)
        }, function (err) {
            if (err) {
                deferred.reject(err);
            } else {
                deferred.resolve(true);
            }
        });
        return deferred.promise;
    });
};

/**
 * Adds a callback to execute before removing an object from the collection
 * @param  {Function} callback receives an objectID and a next function to be called once the callback is done
 */
Collection.prototype.preRemove = function (callback) {
    this.preRemoves.push(callback);
};

Collection.prototype.executePreRemove = function (objectID) {
    var deferred = Q.defer();

    var preRemoves = [];
    for (var i = 0; i < this.preRemoves.length; i++) {
        preRemoves.push(async.apply(this.preRemoves[i], objectID));
    }

    async.series(preRemoves, function (err, result) {
        if (err) {
            deferred.reject(err);
        } else {
            deferred.resolve(result);
        }
    });

    return deferred.promise;
};

/**
 * Finds and returns in a promise objects in the collection
 */
Collection.prototype.find = function (where, findOne) {
    var deferred = Q.defer();
    var that = this;
    this.collection().find(where || {}).sort(this.sort).toArray(function (err, results) {
        if (err) {
            deferred.reject(err);
        } else {
            that.filterAll(results).then(function () {
                deferred.resolve(findOne ? (results.length > 0 ? results[0] : null) : results);
            }).fail(function (err) {
                deferred.reject(err);
            });
        }
    });
    return deferred.promise;
};

Collection.prototype.findById = function (objectID) {
    return this.find({
        _id: toObjectID(objectID)
    }, true);
};

Collection.prototype.findAndModify = function (objectID, set) {
    var deferred = Q.defer();
    var that = this;
    this.validate(set, false).then(function (set) {
        if (!set) {
            deferred.reject({
                status: 400,
                message: 'Invalid update'
            });
            return;
        }

        that.collection().findOneAndUpdate({
            _id: toObjectID(objectID)
        }, {
            $set: set
        }, {
            returnOriginal: false,
            sort: {
                _id: 1
            }
        }, function (err, object) {
            if (err) {
                deferred.reject(err);
            } else {
                that.filter(object.value).then(function () {
                    deferred.resolve(object.value);
                }).fail(function (err) {
                    deferred.reject(err);
                });
            }
        });
    });
    return deferred.promise;
};

Collection.prototype.findAndUpdate = function (objectID, operators) {
    var deferred = Q.defer();
    var that = this;

    that.collection().findOneAndUpdate({
        _id: toObjectID(objectID)
    }, operators, {
        returnOriginal: false,
        sort: {
            _id: 1
        }
    }, function (err, object) {
        if (err) {
            deferred.reject(err);
        } else {
            that.filter(object.value).then(function () {
                deferred.resolve(object.value);
            }).fail(function (err) {
                deferred.reject(err);
            });
        }
    });
    return deferred.promise;
};

Collection.prototype.count = function () {
    var deferred = Q.defer();
    this.collection().count(function (err, count) {
        if (err) {
            deferred.reject(err);
        } else {
            deferred.resolve(count);
        }
    });
    return deferred.promise;
};

var toObjectID = function (objectID) {
    try {
        return typeof objectID === 'string' ? new ObjectID(objectID) : objectID;
    } catch (err) {
        return null;
    }
};

Collection.prototype.toObjectID = function (objectID) {
    return toObjectID(objectID);
};

/**
 * All documents retrieved will be filtered through this function. Can be use used to add/delete fields from the document.
 * Modifications must be done over the given document
 * @param {Function} filter receives a document, and returns the document filtered or a promise.
 */
Collection.prototype.setFilter = function (filter) {
    this._filter = filter;
};

/**
 * Filters a document with the current filter
 */
Collection.prototype.filter = function (doc) {
    if (this._filter) {
        return Q(this._filter(doc));
    } else {
        return Q.fcall(function () {
            return doc;
        });
    }
};

/**
 * Filters all docuemnts with the current filter.
 */
Collection.prototype.filterAll = function (docs) {
    var promises = [];
    for (var i = 0; i < docs.length; i++) {
        promises.push(this.filter(docs[i]));
    }
    return Q.all(promises);
};

/**
 * Validates the input when a document is inserted or updated. The validator can return a modified document.
 * This modified document will be the one stored in the collection
 *
 * @param {Function} validator receives the document to validate and a boolean marking if the document is inserted.
 * If false, is being updated. Returns the modified document/null if the document is valid/invalid (or a promise)
 */
Collection.prototype.setValidator = function (validator) {
    this._validator = validator;
};

Collection.prototype.validate = function (doc, insert) {
    if (this._validator) {
        return Q(this._validator(doc, insert));
    } else {
        return Q.fcall(function () {
            return doc;
        });
    }
};

Collection.prototype.validateAll = function (docs) {
    var promises = [];
    for (var i = 0; i < docs.length; i++) {
        promises.push(this.validate(docs[i]));
    }
    return Q.all(promises);
};

module.exports = Collection;