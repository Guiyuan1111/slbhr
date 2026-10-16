// 模块: States/Menu/MultiMenu  (init.beautified.js L67885-L67930)
      define("States/Menu/MultiMenu", ["require", "Phaser", "States/Menu/Menu", "States/Menu/MultiHall", "States/Menu/TempleSelector"], function (c) {
        var d;
        var e;
        var f;
        var g;
        c("Phaser");
        d = c("States/Menu/Menu");
        e = c("States/Menu/MultiHall");
        g = c("States/Menu/TempleSelector");
        return f = f = function (c) {
          function d() {
            this.shutdown = a(this.shutdown, this);
            this.layoutContent = a(this.layoutContent, this);
            this.update = a(this.update, this);
            this.addContent = a(this.addContent, this);
            this.preload = a(this.preload, this);
            return d.__super__.constructor.apply(this, arguments);
          }
          b(d, c);
          d.prototype.preload = function () {
            return d.__super__.preload.apply(this, arguments);
          };
          d.prototype.addContent = function () {
            var a;
            this.inputEnableChildren = true;
            this.templeHall = a = new e(this.game, 0, 0);
            this.root.addChild(a);
            a.onStart.add(this.startTemple);
            this.afterAddContent();
            return this.onReady.dispatch();
          };
          d.prototype.update = function () {
            if (this.templeHall != null) {
              return this.templeHall.update();
            }
          };
          d.prototype.layoutContent = function () {
            d.__super__.layoutContent.call(this);
            return this.templeHall.layoutContent();
          };
          d.prototype.shutdown = function () {
            return this.templeHall.destroy();
          };
          return d;
        }(d);
      });