// 模块: Ads/AdManager  (init.beautified.js L78526-L78561)
      define("Ads/AdManager", ["require", "Phaser"], function (c) {
        var d;
        var e;
        e = c("Phaser");
        return d = d = function (c) {
          function d() {
            this.pauseGame = a(this.pauseGame, this);
            this.resumeGame = a(this.resumeGame, this);
            this.showAd = a(this.showAd, this);
            this.start = a(this.start, this);
            return d.__super__.constructor.apply(this, arguments);
          }
          b(d, c);
          d.prototype.start = function (a) {
            this.game = a;
            this.game.config.devSkipAds;
          };
          d.prototype.showAd = function (a) {
            if (a != null) {
              a();
            }
            return;
          };
          d.prototype.resumeGame = function () {
            this.game.paused = false;
            if (this.callback != null) {
              this.callback();
            }
            return this.callback = null;
          };
          d.prototype.pauseGame = function () {
            return this.game.paused = true;
          };
          return d;
        }(e.Signal);
      });