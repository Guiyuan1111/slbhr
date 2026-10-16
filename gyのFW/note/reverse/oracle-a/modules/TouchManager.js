// 模块: TouchManager  (init.beautified.js L78053-L78503)
      define("TouchManager", ["Phaser"], function (c) {
        "use strict";

        var d;
        return d = d = function (d) {
          function e() {
            this.update = a(this.update, this);
            this.hammerIt = a(this.hammerIt, this);
            this.unregister = a(this.unregister, this);
            this.register = a(this.register, this);
            this.resize = a(this.resize, this);
            this.start = a(this.start, this);
            return e.__super__.constructor.apply(this, arguments);
          }
          b(e, d);
          e.prototype.start = function (a) {
            this.game = a;
            this.$el = $("#hammer");
            this.$el.css({
              position: "absolute",
              top: 0,
              lef: 0,
              width: window.innerWidth || $(window).width(),
              height: window.innerHeight || $(window).height()
            });
            this.hammerIt();
            return this.events = {};
          };
          e.prototype.resize = function () {
            return this.$el.css({
              position: "absolute",
              top: 0,
              lef: 0,
              width: window.innerWidth || $(window).width(),
              height: window.innerHeight || $(window).height()
            });
          };
          e.prototype.register = function (a, b, c) {
            var e;
            var f;
            var g;
            var h;
            b = b.split(" ").length > 0 ? b.split(" ") : [ev];
            h = [];
            f = 0;
            g = b.length;
            for (; f < g; f++) {
              e = b[f];
              this.events[e] ||= [];
              h.push(this.events[e].unshift({
                sprite: a,
                callback: c
              }));
            }
            return h;
          };
          e.prototype.unregister = function (a, b) {
            var c;
            var d;
            var e;
            var f;
            var g;
            b = b.split(" ").length > 0 ? b.split(" ") : [ev];
            g = [];
            e = 0;
            f = b.length;
            for (; e < f; e++) {
              c = b[e];
              d = _.find(this.events[c], function (b) {
                return b.sprite === a;
              });
              g.push(this.events[c].splice(this.events[c].indexOf(d), 1));
            }
            return g;
          };
          e.prototype.hammerIt = function () {
            var a;
            a = new Hammer(this.$el[0], {});
            a.get("pinch").set({
              enable: true
            });
            a.get("swipe").set({
              enable: true
            });
            a.get("pinch").recognizeWith(a.get("pan"));
            if (this.game.bowser.mobile || this.game.bowser.tablet) {
              a.on("tap", function (a) {
                return function (b) {
                  var d;
                  var e;
                  var f;
                  var g;
                  var h;
                  if (a.events.tap != null) {
                    g = a.events.tap;
                    h = [];
                    e = 0;
                    f = g.length;
                    for (; e < f; e++) {
                      d = g[e];
                      if (d != null) {
                        if (d.sprite == null || d.sprite.visible && a.game.input.hitTest(d.sprite, b.center, new c.Point())) {
                          d.callback(b);
                          break;
                        }
                        h.push(undefined);
                      }
                    }
                    return h;
                  }
                };
              }(this));
            }
            a.on("pan", function (a) {
              return function (b) {
                var d;
                var e;
                var f;
                var g;
                var h;
                if (a.events.pan != null) {
                  g = a.events.pan;
                  h = [];
                  e = 0;
                  f = g.length;
                  for (; e < f; e++) {
                    d = g[e];
                    if (d != null) {
                      if (d.sprite == null || d.sprite.visible && a.game.input.hitTest(d.sprite, b.center, new c.Point())) {
                        h.push(d.callback(b));
                      } else {
                        h.push(undefined);
                      }
                    }
                  }
                  return h;
                }
              };
            }(this));
            a.on("panstart", function (a) {
              return function (b) {
                var d;
                var e;
                var f;
                var g;
                var h;
                if (a.events.panstart != null) {
                  g = a.events.panstart;
                  h = [];
                  e = 0;
                  f = g.length;
                  for (; e < f; e++) {
                    d = g[e];
                    if (d != null) {
                      if (d.sprite == null || d.sprite.visible && a.game.input.hitTest(d.sprite, b.center, new c.Point())) {
                        d.callback(b);
                        break;
                      }
                      h.push(undefined);
                    }
                  }
                  return h;
                }
              };
            }(this));
            a.on("panmove", function (a) {
              return function (b) {
                var c;
                var d;
                var e;
                var f;
                var g;
                if (a.events.panmove != null) {
                  f = a.events.panmove;
                  g = [];
                  d = 0;
                  e = f.length;
                  for (; d < e; d++) {
                    c = f[d];
                    if (c != null) {
                      g.push(c.callback(b));
                    }
                  }
                  return g;
                }
              };
            }(this));
            a.on("panend", function (a) {
              return function (b) {
                var c;
                var d;
                var e;
                var f;
                var g;
                if (a.events.panend != null) {
                  f = a.events.panend;
                  g = [];
                  d = 0;
                  e = f.length;
                  for (; d < e; d++) {
                    c = f[d];
                    if (c != null) {
                      g.push(c.callback(b));
                    }
                  }
                  return g;
                }
              };
            }(this));
            a.on("swipe", function (a) {
              return function (b) {
                var c;
                var d;
                var e;
                var f;
                var g;
                if (a.events.swipe != null) {
                  f = a.events.swipe;
                  g = [];
                  d = 0;
                  e = f.length;
                  for (; d < e; d++) {
                    c = f[d];
                    if (c != null) {
                      if (c.sprite == null || c.sprite.visible) {
                        g.push(c.callback(b));
                      } else {
                        g.push(undefined);
                      }
                    }
                  }
                  return g;
                }
              };
            }(this));
            a.on("pinch", function (a) {
              return function (b) {
                var c;
                var d;
                var e;
                var f;
                var g;
                if (a.events.pinch != null) {
                  f = a.events.pinch;
                  g = [];
                  d = 0;
                  e = f.length;
                  for (; d < e; d++) {
                    c = f[d];
                    if (c != null) {
                      g.push(c.callback(b));
                    }
                  }
                  return g;
                }
              };
            }(this));
            a.on("pinchend", function (a) {
              return function (b) {
                var c;
                var d;
                var e;
                var f;
                var g;
                if (a.events.pinchend != null) {
                  f = a.events.pinchend;
                  g = [];
                  d = 0;
                  e = f.length;
                  for (; d < e; d++) {
                    c = f[d];
                    if (c != null) {
                      g.push(c.callback(b));
                    }
                  }
                  return g;
                }
              };
            }(this));
            if (this.game.bowser.mobile || this.game.bowser.tablet) {
              this.$el.on("touchstart", function (a) {
                return function (b) {
                  var d;
                  var e;
                  var f;
                  var g;
                  var h;
                  var i;
                  var j;
                  h = b.originalEvent.changedTouches;
                  i = [];
                  e = 0;
                  f = h.length;
                  for (; e < f; e++) {
                    j = h[e];
                    if (a.events.touchstart != null) {
                      g = {
                        x: j.clientX,
                        y: j.clientY
                      };
                      i.push(function () {
                        var a;
                        var e;
                        var f;
                        var h;
                        f = this.events.touchstart;
                        h = [];
                        a = 0;
                        e = f.length;
                        for (; a < e; a++) {
                          d = f[a];
                          if (d != null) {
                            if (d.sprite == null || d.sprite.visible && this.game.input.hitTest(d.sprite, g, new c.Point())) {
                              d.callback(b);
                              d.sprite.touchId = j.identifier;
                              break;
                            }
                            h.push(undefined);
                          }
                        }
                        return h;
                      }.call(a));
                    } else {
                      i.push(undefined);
                    }
                  }
                  return i;
                };
              }(this));
              return this.$el.on("touchend touchcancel", function (a) {
                return function (b) {
                  var d;
                  var e;
                  var f;
                  var g;
                  var h;
                  var i;
                  var j;
                  var k;
                  if (a.events.touchend != null) {
                    h = b.originalEvent.changedTouches;
                    i = [];
                    e = 0;
                    f = h.length;
                    for (; e < f; e++) {
                      k = h[e];
                      g = {
                        x: k.clientX,
                        y: k.clientY
                      };
                      i.push(function () {
                        var a;
                        var e;
                        var f;
                        var h;
                        f = this.events.touchend;
                        h = [];
                        a = 0;
                        e = f.length;
                        for (; a < e; a++) {
                          d = f[a];
                          if (d != null) {
                            if (d.sprite == null || d.sprite.touchId === k.identifier) {
                              d.sprite.touchId = null;
                              j = this.game.input.hitTest(d.sprite, g, new c.Point());
                              h.push(d.callback(b, j));
                            } else {
                              h.push(undefined);
                            }
                          }
                        }
                        return h;
                      }.call(a));
                    }
                    return i;
                  }
                };
              }(this));
            } else {
              this.$el.on("mousedown", function (a) {
                return function (b) {
                  var d;
                  var e;
                  var f;
                  var g;
                  var h;
                  var i;
                  if (a.events.mousedown != null) {
                    g = {
                      x: b.originalEvent.clientX,
                      y: b.originalEvent.clientY
                    };
                    h = a.events.mousedown;
                    i = [];
                    e = 0;
                    f = h.length;
                    for (; e < f; e++) {
                      d = h[e];
                      if (d != null) {
                        if (d.sprite == null || d.sprite.visible && a.game.input.hitTest(d.sprite, g, new c.Point())) {
                          d.callback(b);
                          d.sprite.mousedowned = true;
                          break;
                        }
                        i.push(d.sprite.mousedowned = false);
                      }
                    }
                    return i;
                  }
                };
              }(this));
              return this.$el.on("mouseup", function (a) {
                return function (b) {
                  var d;
                  var e;
                  var f;
                  var g;
                  var h;
                  var i;
                  var j;
                  if (a.events.mouseup != null) {
                    g = {
                      x: b.originalEvent.clientX,
                      y: b.originalEvent.clientY
                    };
                    h = a.events.mouseup;
                    i = [];
                    e = 0;
                    f = h.length;
                    for (; e < f; e++) {
                      d = h[e];
                      if (d != null) {
                        if (d.sprite == null || d.sprite.visible && d.sprite.mousedowned) {
                          d.sprite.mousedowned = false;
                          j = a.game.input.hitTest(d.sprite, g, new c.Point());
                          i.push(d.callback(b, j));
                        } else {
                          i.push(undefined);
                        }
                      }
                    }
                    return i;
                  }
                };
              }(this));
            }
          };
          e.prototype.update = function () {};
          return e;
        }(c.Signal);
      });