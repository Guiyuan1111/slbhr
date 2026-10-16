// 模块: States/Level/MechManager  (init.beautified.js L63482-L63662)
      define("States/Level/MechManager", ["./Devices/Device", "./Devices/_define"], function () {
        "use strict";

        var c;
        c = c = function (c) {
          function d(b) {
            this.deviceChanged = a(this.deviceChanged, this);
            this.resetStates = a(this.resetStates, this);
            this.connectToWall = a(this.connectToWall, this);
            this.registerDevice = a(this.registerDevice, this);
            this.game = b;
            this.deviceGroups = {};
          }
          b(d, c);
          d.prototype.registerDevice = function (a) {
            var c;
            c = a.options.properties.group;
            this.deviceGroups[c] ||= [];
            this.deviceGroups[c].push(a);
            if (a.signal != null) {
              return a.signal.add(this.deviceChanged);
            }
          };
          d.prototype.connectPortals = function () {
            var c;
            var d;
            var e;
            var f;
            var g;
            var i;
            var j;
            var k;
            var l;
            j = {};
            k = this.deviceGroups;
            for (f in k) {
              d = k[f];
              e = 0;
              g = d.length;
              for (; e < g; e++) {
                c = d[e];
                if (c.options.type === "portal") {
                  j[c.options.properties.portalId] ||= [];
                  j[c.options.properties.portalId].push(c);
                }
              }
            }
            l = [];
            for (f in j) {
              i = j[f];
              i[0].other = i[1];
              i[1].other = i[0];
              i[0].options.properties.inverted ||= false;
              i[1].options.properties.inverted ||= false;
              this.connectToWall(i[0]);
              l.push(this.connectToWall(i[1]));
            }
            return l;
          };
          d.prototype.connectToWall = function (a) {
            var b;
            var c;
            var d;
            var e;
            var f;
            var g;
            var h;
            g = this.game.physics.box2d.pxm(a.options.x);
            h = this.game.physics.box2d.pxm(a.options.y);
            d = new box2d.b2Vec2(g, h);
            c = d.Clone().SelfAdd(new box2d.b2Vec2(0.5, 0).SelfRotateRadians(a.options.rotation));
            f = d.Clone().SelfAdd(new box2d.b2Vec2(-0.5, 0).SelfRotateRadians(a.options.rotation));
            if (this.game.level.ground.getTileAt(Math.floor(c.x), Math.floor(c.y)).properties.type === -1) {
              b = c;
            }
            if (this.game.level.ground.getTileAt(Math.floor(f.x), Math.floor(f.y)).properties.type === -1) {
              b = f;
            }
            if (b != null) {
              b.SelfAdd(new box2d.b2Vec2(0, -0.5).SelfRotateRadians(a.options.rotation));
              e = {
                center: {
                  x: -b.x,
                  y: -b.y
                },
                rotation: a.options.rotation,
                width: 0.5,
                height: 1.5
              };
              return a.createFakeBlock(e);
            }
          };
          d.prototype.resetStates = function () {
            var a;
            var b;
            var c;
            var d;
            var e;
            d = this.deviceGroups;
            e = [];
            for (c in d) {
              b = d[c];
              e.push(function () {
                var c;
                var d;
                var e;
                e = [];
                c = 0;
                d = b.length;
                for (; c < d; c++) {
                  a = b[c];
                  e.push(a.updateState(true));
                }
                return e;
              }());
            }
            return e;
          };
          d.prototype.deviceChanged = function (a) {
            var b;
            var c;
            var d;
            var e;
            var f;
            var g;
            var h;
            var i;
            var j;
            console.log("--");
            g = a.state;
            h = this.deviceGroups[a.options.properties.group];
            c = 0;
            e = h.length;
            for (; c < e; c++) {
              b = h[c];
              if (b.signal != null) {
                g = g || b.state;
              }
            }
            i = this.deviceGroups[a.options.properties.group];
            j = [];
            d = 0;
            f = i.length;
            for (; d < f; d++) {
              b = i[d];
              if (b.signal == null) {
                b.state = g;
              }
              j.push(b._updateState());
            }
            return j;
          };
          return d;
        }(Object);
        c.classNames = {
          pusher: Devices.Pusher,
          lever: Devices.Lever,
          box: Devices.Box,
          platform: Devices.MovingPlatform,
          beamer: Devices.Beamer,
          rotmirror: Devices.RotMirror,
          lightpusher: Devices.LightPusher,
          portal: Devices.Portal,
          ball: Devices.Ball,
          pulley: Devices.Pulley,
          hanging: Devices.Hanging,
          boxmirror: Devices.BoxMirror,
          boxheavy: Devices.BoxHeavy,
          infinitemirror: Devices.InfiniteMirror,
          slider: Devices.Slider,
          timedpusher: Devices.TimedPusher,
          wind: Devices.Wind,
          cover: Devices.BackgroundCover,
          window: Devices.Window,
          roman: Devices.Roman
        };
        c.className = function (a) {
          return c.classNames[a];
        };
        return c;
      });