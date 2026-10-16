// 模块: ProgressModel  (init.beautified.js L77027-L77413)
      define("ProgressModel", ["backbone"], function (c) {
        "use strict";

        var d;
        return d = d = function (c) {
          function d(b) {
            this.save = a(this.save, this);
            this.getStored = a(this.getStored, this);
            this.erase = a(this.erase, this);
            this.betterThan = a(this.betterThan, this);
            this.setPlayed = a(this.setPlayed, this);
            this.update = a(this.update, this);
            this.unlockLevels = a(this.unlockLevels, this);
            this.setStates = a(this.setStates, this);
            this.process = a(this.process, this);
            this.initStore = a(this.initStore, this);
            this.fetch = a(this.fetch, this);
            d.__super__.constructor.call(this);
            this.on("sync", this.process);
            this.game = b;
          }
          b(d, c);
          d.prototype.url = "";
          d.prototype.myKeys = [];
          d.prototype.fetch = function () {
            var a;
            var b;
            var c;
            var d;
            var e;
            var f;
            var g;
            e = [];
            a = this.game.gameConfig;
            f = [].concat(a.temples);
            b = 0;
            c = f.length;
            for (; b < c; b++) {
              g = f[b];
              d = $.ajax("./data/" + g + "/temple.json");
              e.push(d);
            }
            return $.when.apply($, e).then(function (a) {
              return function () {
                var b;
                var c;
                var f;
                console.log("all loaded ", e);
                f = {
                  temples: []
                };
                b = 0;
                c = e.length;
                for (; b < c; b++) {
                  d = e[b];
                  f.temples.push(JSON.parse(d.responseText));
                }
                return a.getStored().then(function (b) {
                  var c;
                  var d;
                  f = _.deepObjectExtend(f, b);
                  for (c in f) {
                    d = f[c];
                    a.set(c, d);
                  }
                  if (a.game.gameConfig.target === "cordova" && window.store != null) {
                    a.initStore();
                  } else {
                    console.log("store not available");
                    a.myKeys = [];
                  }
                  return a.trigger("sync");
                });
              };
            }(this));
          };
          d.prototype.initStore = function () {
            console.log("Initing store");
            store.register({
              id: "elements_full",
              alias: "Unlock all",
              type: store.NON_CONSUMABLE
            });
            store.when("product").updated(function (a) {
              return function (b) {
                console.log("product updated: " + b.id + " is owned: " + b.owned);
                if (b.owned) {
                  a.myKeys.push(b.id);
                }
                return a.process();
              };
            }(this));
            store.when("product").approved(function (a) {
              return function (a) {
                console.log("Order approved");
                return a.finish();
              };
            }(this));
            console.log("refresh");
            return store.refresh();
          };
          d.prototype.process = function () {
            var a;
            var b;
            var c;
            var d;
            var e;
            var f;
            var g;
            var h;
            var i;
            var j;
            var k;
            var l;
            var m;
            var n;
            var o;
            var p;
            var q;
            var r;
            var s;
            var t;
            var u;
            var v;
            var w;
            a = 0;
            b = true;
            q = this.get("temples");
            c = 0;
            f = q.length;
            for (; c < f; c++) {
              w = q[c];
              m = Infinity;
              r = w.levels;
              d = 0;
              g = r.length;
              for (; d < g; d++) {
                e = r[d];
                if (e.best != null) {
                  a += e.best.stars;
                }
                if (e.best == null || e.best.stars < 3) {
                  b = false;
                }
                if (e.required < m) {
                  m = e.required;
                }
              }
              w.minRequired = m;
            }
            if (b && !this.get("gameComplete")) {
              this.firstComplete = true;
            }
            this.set("gameComplete", b);
            this.totalStars = a;
            s = this.get("temples");
            l = 0;
            h = s.length;
            for (; l < h; l++) {
              w = s[l];
              w.softLocked = this.totalStars < w.minRequired;
            }
            this.unlockLevels();
            t = this.get("temples");
            n = 0;
            i = t.length;
            for (; n < i; n++) {
              w = t[n];
              this.setStates(w);
            }
            u = this.get("temples");
            o = 0;
            j = u.length;
            for (; o < j; o++) {
              w = u[o];
              delete w.hasNew;
              v = w.levels;
              p = 0;
              k = v.length;
              for (; p < k; p++) {
                e = v[p];
                if (e.played || e.initial || e.locked) {
                  delete e.isNew;
                } else {
                  e.isNew = true;
                  if (e.state > 0) {
                    w.hasNew = true;
                  }
                }
              }
            }
            return this.save();
          };
          d.prototype.setStates = function (a) {
            var b;
            var c;
            var d;
            var e;
            var f;
            var g;
            var h;
            var i;
            var j;
            var k;
            var l;
            var m;
            var n;
            var o;
            var p;
            var q;
            c = function (b) {
              return function (b) {
                return _.find(a.levels, function (a) {
                  return a._id === b;
                });
              };
            }(this);
            if (a.type === "tree") {
              k = a.levels;
              d = 0;
              g = k.length;
              for (; d < g; d++) {
                f = k[d];
                if (f.best != null) {
                  if (f.best.stars === 3) {
                    f.state = 4;
                  } else if (f.best.stars === 2) {
                    f.state = 3;
                  } else if (f.best.stars === 1) {
                    f.state = 2;
                  }
                } else {
                  f.state = f.initial ? 1 : 0;
                }
                if (this.game.config.devUnlock) {
                  f.state = Math.max(f.state, 1);
                }
              }
              l = a.edges;
              n = [];
              e = 0;
              h = l.length;
              for (; e < h; e++) {
                b = l[e];
                p = c(b.source);
                q = c(b.target);
                if (p.state > 1 && q.state === 0) {
                  n.push(q.state = 1);
                } else if (p.state === 0 && q.state > 1) {
                  n.push(p.state = 1);
                } else {
                  n.push(undefined);
                }
              }
              return n;
            }
            m = a.levels;
            o = [];
            j = 0;
            i = m.length;
            for (; j < i; j++) {
              f = m[j];
              if (f.best != null && f.best.stars > 0) {
                if (f.best.stars === 3) {
                  f.state = 4;
                } else if (f.best.stars === 2) {
                  f.state = 3;
                } else if (f.best.stars === 1) {
                  f.state = 2;
                }
              } else if (this.game.progress.totalStars >= f.required && !f.locked) {
                f.state = 1;
              } else {
                f.state = 0;
              }
              if (this.game.config.devUnlock) {
                o.push(f.state = Math.max(f.state, 1));
              } else {
                o.push(undefined);
              }
            }
            return o;
          };
          d.prototype.unlockLevels = function () {
            var a;
            var b;
            var c;
            var d;
            var e;
            var f;
            var g;
            console.log("Unlocking with keys ", this.myKeys);
            b = function (a) {
              return function (b) {
                return b.unlock_key != null && b.unlock_key !== "free" && a.myKeys.indexOf(b.unlock_key) < 0;
              };
            }(this);
            e = this.get("temples");
            f = [];
            a = 0;
            d = e.length;
            for (; a < d; a++) {
              g = e[a];
              g.locked = b(g);
              f.push(function () {
                var a;
                var d;
                var e;
                var f;
                e = g.levels;
                f = [];
                a = 0;
                d = e.length;
                for (; a < d; a++) {
                  c = e[a];
                  f.push(c.locked = b(c));
                }
                return f;
              }());
            }
            return f;
          };
          d.prototype.update = function (a) {
            var b;
            var c;
            var d;
            var e;
            var f;
            console.log("merge " + a.state + " into " + a.data);
            b = a.state.diamonds;
            c = a.data.totalDiamonds;
            e = a.state.time;
            f = this.game.settings.controls === "single" && a.data.mobileTime || a.data.time;
            d = 0;
            if (a.data.type === "puzzle") {
              if (a.state.silverDiamond > 0) {
                d = 3;
              }
            } else if (a.data.type === "dark") {
              d = e <= f ? 3 : 2;
            } else {
              d = 1;
              if (b >= c) {
                d++;
              }
              if (e <= f) {
                d++;
              }
            }
            a.state.stars = d;
            if (a.state.stars > 0 && (a.data.best == null || this.betterThan(a.state, a.data.best))) {
              a.data.best = a.state;
              return this.process();
            }
          };
          d.prototype.setPlayed = function (a) {
            if (!a.played) {
              a.played = true;
              return this.process();
            }
          };
          d.prototype.betterThan = function (a, b) {
            return a.stars > b.stars || !(a.stars < b.stars) && (a.diamonds > b.diamonds || !(a.diamonds < b.diamonds) && (a.time < b.time || (a.time > b.time, false)));
          };
          d.prototype.erase = function () {
            this.game.storage.setNamespace("fb-" + this.game.gameConfig.id);
            return this.game.storage.clear();
          };
          d.prototype.getStored = function () {
            this.game.storage.setNamespace("fb-" + this.game.gameConfig.id);
            return this.game.storage.getItem("progress").then(function (a) {
              return function (a) {
                return JSON.parse(a);
              };
            }(this), function (a) {
              return function (a) {
                return null;
              };
            }(this));
          };
          d.prototype.save = function () {
            this.game.storage.setNamespace("fb-" + this.game.gameConfig.id);
            return this.game.storage.setItem("progress", JSON.stringify(this.toJSON()));
          };
          return d;
        }(c.Model);
      });