// 模块: States/Level/Devices/Device  (init.beautified.js L55504-L55674)
      define("States/Level/Devices/Device", ["Phaser"], function () {
        "use strict";

        var c;
        c = c = function (c) {
          function d(b, c) {
            this.sounds = a(this.sounds, this);
            this.ocupy = a(this.ocupy, this);
            this.ocupyTile = a(this.ocupyTile, this);
            this.checkState = a(this.checkState, this);
            this.updateState = a(this.updateState, this);
            this._updateState = a(this._updateState, this);
            this.updateLight = a(this.updateLight, this);
            this.setupLight = a(this.setupLight, this);
            this.getColor = a(this.getColor, this);
            this.registerDevice = a(this.registerDevice, this);
            this.pxm = a(this.pxm, this);
            this.mpx = a(this.mpx, this);
            var f;
            var g;
            var h;
            var i;
            this.lights = [];
            g = {};
            _.deepObjectExtend(g, this._defaults);
            c.properties ||= {};
            _.deepObjectExtend(g, c);
            _.deepObjectExtend(g, this.options);
            this.options = g;
            if (this.options.layer == null) {
              this.options.layer = "overGround";
            }
            this.options.rotation ||= 0;
            this.options.rotation = Math.PI * this.options.rotation / 180;
            this.options.width = b.physics.box2d.pxm(this.options.width);
            this.options.height = b.physics.box2d.pxm(this.options.height);
            h = this.options.x;
            i = this.options.y;
            this.state = this.options.properties != null ? +this.options.properties.initialState || 0 : 0;
            d.__super__.constructor.call(this, b);
            if (this.options.atlasName != null && this.options.frameName != null) {
              this.sprite = this.game.make.resSprite(h, i, this.options.atlasName, this.options.frameName);
              this.game.layers[this.options.layer].addChild(this.sprite);
              this.sprite.anchor.set(0.5);
            }
            if (this.sprite != null) {
              this.sprite.autoCull = true;
            }
            if (this.sprite && this.options.enableBody === true) {
              this.game.physics.box2d.enable(this.sprite);
              this.sprite.body.clearFixtures();
              this.sprite.body.data.SetAngle(Math.PI * c.rotation / 180 || 0);
              this.body = this.sprite.body;
            }
            if (this.options.lightAtlas != null && this.options.lightFrame != null) {
              f = this.create(0, 0, this.options.lightAtlas, this.options.lightFrame + "_on0000");
              if (this.sprite != null) {
                this.sprite.addChild(f);
              }
              f.anchor.set(0.5);
              f.offFrameName = this.options.lightFrame + "_off0000";
              f.onFrameName = this.options.lightFrame + "_on0000";
              f.frameName = f.offFrameName;
              this.lights.push(f);
            }
            _.defer(function (a) {
              return function () {
                return a.updateLight(a.state);
              };
            }(this));
          }
          b(d, c);
          d.prototype._defaults = {
            atlasName: null,
            frameName: null,
            lightAtlas: null,
            lightFrame: null
          };
          d.prototype.mpx = function (a) {
            return this.game.physics.box2d.mpx(a * -1);
          };
          d.prototype.pxm = function (a) {
            return this.game.physics.box2d.pxm(a * -1);
          };
          d.prototype.registerDevice = function () {
            this.game.MechManager.registerDevice(this);
            if (this.lights.length > 0) {
              return this.setupLight();
            }
          };
          d.prototype.getColor = function () {
            var a;
            a = Number(String(this.options.properties.group)[0]);
            return d.groupColors[a] || "#ffffff";
          };
          d.prototype.setupLight = function () {
            var a;
            var b;
            var c;
            var d;
            var e;
            e = this.lights;
            b = 0;
            d = e.length;
            for (; b < d; b++) {
              c = e[b];
              a = this.getColor();
              c.offTint = Phaser.Color.hexToColor(a).color;
              c.onTint = Phaser.Color.hexToColor(a).color;
              c.tint = c.offTint;
            }
          };
          d.prototype.updateLight = function (a) {
            var b;
            var c;
            var d;
            var e;
            var f;
            if (this.lights.length !== 0) {
              e = this.lights;
              f = [];
              b = 0;
              d = e.length;
              for (; b < d; b++) {
                c = e[b];
                if (c.onFrameName != null && a) {
                  c.frameName = c.onFrameName;
                  f.push(c.tint = c.onTint);
                } else if (c.offFrameName == null || a) {
                  f.push(undefined);
                } else {
                  c.frameName = c.offFrameName;
                  f.push(c.tint = c.offTint);
                }
              }
              return f;
            }
          };
          d.prototype.update = function () {
            return this.checkState();
          };
          d.prototype._updateState = function () {
            this.updateLight(this.state);
            return this.updateState();
          };
          d.prototype.updateState = function () {};
          d.prototype.checkState = function () {};
          d.prototype.ocupyTile = function (a, b, c) {
            if (a[Math.floor(c)] != null && a[Math.floor(c)][Math.floor(b)] != null) {
              return a[Math.floor(c)][Math.floor(b)].ocupied = true;
            }
          };
          d.prototype.ocupy = function (a, b) {
            return false;
          };
          d.prototype.sounds = function () {
            return [];
          };
          return d;
        }(Phaser.Group);
        c.groupColors = {
          1: "#ff0000",
          2: "#00cc00",
          3: "#0D3EFF",
          4: "#ffff00",
          5: "#EC0EF1",
          6: "#57beff",
          7: "#9933FF"
        };
        return c;
      });