// 模块: States/Menu/SingleMenu  (init.beautified.js L67288-L67320)
      define("States/Menu/SingleMenu", ["require", "Phaser", "States/Menu/TempleHall", "States/Menu/Menu"], function (c) {
        var d;
        var e;
        var f;
        c("Phaser");
        f = c("States/Menu/TempleHall");
        d = c("States/Menu/Menu");
        return e = e = function (c) {
          function d() {
            this.layoutContent = a(this.layoutContent, this);
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
            this.templeHall = a = new f(this.game, 0, 0);
            this.root.addChild(a);
            a.onStart.add(this.startTemple);
            this.onReady.dispatch();
            return this.afterAddContent();
          };
          d.prototype.layoutContent = function () {
            d.__super__.layoutContent.call(this);
            return this.templeHall.layoutContent();
          };
          return d;
        }(d);
      });