window.Diffa = window.Diffa || new Object;

function urlTemplate(tmpl) { 
    return function template() { 
        var attrs = this.attributes;
        return tmpl.replace(/:([([a-zA-Z0-9]*)/g, function(_whole, name) {
            return attrs[name] || '';
        });
    }
}


Diffa.Instrument = Backbone.Model.extend({
    validate: function validate(attributes) {
        if (!/^[FO]/.test(attributes.ttype)) { return "invalid trade type: " + attributes.ttype; };
        if (attributes.price < 0) { return "invalid price: " + attributes.price; };
        if (isNaN(attributes.expiry.getFullYear())) {
            return "Expiry date " + attributes.expiry.toString() + " is invalid";
        }
        if (attributes.expiry < attributes.entry_date) { 
            return "Expiry date " + Diffa.dateToString(attributes.expiry) + 
                    " must be after entry date " + Diffa.dateToString(attributes.entry_date);
        }
    },
    parse: function(json) {
        var contract_period = new Date(0, 0, 1, 0, 0);
        if (json) { 
            console.log("parsing", json);
            if (json.contract_period) {
                var contract_period_str = json.contract_period;
                var mmyy = contract_period_str.split('/', 2).map(function(n) { return parseInt(n, 10); });
                json.contract_period = new Date(0);
                json.contract_period.setMonth(mmyy[0] - 1)
                json.contract_period.setFullYear(mmyy[1]);
                console.log("contract period", contract_period_str, mmyy, json.contract_period); 
            };
            if (json.expiry) {
                json.expiry = new Date(json.expiry);
            }
            if (json.entry_date) json.entry_date = new Date(json.entry_date);
            if (json.trade_date) json.trade_date = new Date(json.trade_date);
            if (json.is_future) json.is_future = (json.is_future == 'Y');
            if (json.is_call) json.is_call = (json.is_call == 'Y');
            if (json.is_put) json.is_put = (json.is_put == 'Y');
            return json;
        }
    },
    toJSON: function toJSON () {
        var json = Diffa.Instrument.__super__.toJSON.call(this);
        if (json.contract_period) {
            mmyy = [json.contract_period.getMonth() + 1, json.contract_period.getFullYear()];
            json.contract_period = mmyy.join("/");
        };
        console.log("Instrument#toJSON", json);
        return json;
    },
    // url: urlTemplate("/grid/trades/:id"),
    defaults: { 
        ttype: 'O',
        quantity: 1,
        price: 0.0001,
        entry_date: new Date(),
        expiry: new Date(),
    },

    save: function save(key, value, options) {
        var model = this;
        var promise = Diffa.Instrument.__super__.save.call(this, key, value, options);
        promise.then(function(response) { 
            if (response) model.set(response);
        });
    }

});

Diffa.Trade = Diffa.Instrument.extend({
    initialize: function initialize(arguments) {
        Diffa.Instrument.__super__.initialize.apply(this, arguments);
        this.on('change:is_future', this.isFutureChanged.bind(this));
        this.on('change:is_put', this.isPutChanged.bind(this));
        this.on('change:is_call', this.isCallChanged.bind(this));
        
    },
    isFutureChanged: function isFutureChanged (model, value, opts) {
        console.log("isFutureChanged", arguments);
        if (value) model.set({is_put: false, is_call: false });
    },
    isCallChanged: function isCallChanged (model, value, opts) {
        console.log("isCallChanged", arguments);
        if (value) model.set({is_future: false, is_put: false });
    },
    isPutChanged: function isPutChanged (model, value, opts) {
        console.log("isPutChanged", arguments);
        if (value) model.set({is_future: false, is_call: false });
    },
    pushDownstream: function () {
        var rpcEndpoint = this.url() + '/push';
        return $.ajax({url: rpcEndpoint, type: 'POST', dataType: 'json', headers: { 'X-authToken': Diffa.authToken } }).
            pipe(function(futureJson, state, xhr) {
                return new Diffa.Future(futureJson);
        });
    },
});
Diffa.Future = Diffa.Instrument.extend({
});

Diffa.Option = Diffa.Instrument.extend({
});



Diffa.Trade.prototype.__properties = ['id', 'type', 'quantity', 'expiry', 'price', 'direction',
                      'entry_date', 'version'];

Diffa.Trade.prototype.toString = function() { 
    return "<Diffa.Trade " + JSON.stringify(this) + ">";
}

Diffa.DateEditor = function(args) {
    this.container    = args.container;
    this.column       = args.column;
    this.defaultValue = null;
    this.$input       = this.createTextInputElement();
//     this.picker       = this.$input.glDatePicker({
//         position: 'static', showAlways: true,
//         onChange: this.whenChanged.bind(this)
//     });
}

_.extend(Diffa.DateEditor.prototype, Slickback.EditorMixin, {
    serializeValue: function() {
        var parsed = new Date(this.$input.val());
        // return this.currval || this.$input.val();
        return parsed;
    },

    validate: function() {
        var column = this.column;
        var date = new Date(this.$input.val());
        if (isNaN(date.getTime())) {
            return { valid: false, msg: "Date " + this.$input.val() + " is not a valid date" };
        }
        return column.validator ?  column.validator(this.$input.val()) : { valid: true, msg: null };
    },
    whenChanged: function(target, value) {
        console.log("DateEditor#whenChanged", target, value);
        var serialized = Diffa.dateToString(value);
        this.$input.val(serialized);
        this.currval = value;
    }
});

Diffa.dateToString = function dateToString(date) {
    if (!date) { ("Date is undefined!") };
    return [date.getFullYear(), date.getMonth() +1, date.getDate()].join("/");
}
Diffa.GridView = {};
Diffa.GridView.DateFormatter = function DateFormatter(row, cell, value, columnDef, dataContext) {
    console.log("Get", columnDef.field, "from", dataContext.attributes);
    var value = dataContext.get(columnDef.field);
    if (!value) return;
    return Diffa.dateToString(value);
}

Diffa.GridView.ButtonFormatter = function ButtonFormatter(row, cell, value, columnDef, trade) {
    return $('<button/>').attr('id', 'tradepusher-' + trade.cid).text('Push').wrap('<div/>').parent().html();
}

    Diffa.Views = Diffa.Views || {};
    Diffa.Views.AutoSaveGrid = Backbone.View.extend({
        initialize: function initialize(initOptions) {
            var gridOptions = _.extend({},{
                editable:         true,
                formatterFactory: Slickback.BackboneModelFormatterFactory,
                enableColumnReorder: false,
            }, initOptions.grid);

            var collection = this.collection;

            var grid = new Slick.Grid(this.el,collection, this.columns, gridOptions);
            collection.bind('change',function(model,options) {
                model.save();
            });

            grid.onMouseEnter.subscribe(this.cellMouseOver.bind(this));
            grid.onMouseLeave.subscribe(this.cellMouseLeave.bind(this));

            collection.onRowCountChanged.subscribe(function() {
                grid.updateRowCount();
                grid.render();
            });

            collection.onRowsChanged.subscribe(function() {
                grid.invalidateAllRows();
                grid.render();
            });

            collection.fetch();
        },
        cellMouseOver: function(e, args) {
            var cell = args.grid.getCellFromEvent(e);
            var col = this.columns[cell.cell];
            if (col.editor) return;

            if (!$(e.target).data('grid.tooltip')) { 
                var entity = this.collection.at(cell.row);
                $(e.target).tooltip({title: this.toolTipFor(entity), trigger: 'hover', html:true}).tooltip('show');
                $(e.target).data('grid.tooltip', true);
            }
        },
        cellMouseLeave: function(e, args) {
                $(e.target).tooltip('hide');
        },
        toolTipFor: function(ent) { 
            return this.toolTipTemplate(ent.attributes);
        }
    });

    var booleanChoices = [ 
        { label: "True", value: true },
        { label: "False", value: false },
    ];

    var dateWidth = 120;
    Diffa.Views.TradesGrid = Diffa.Views.AutoSaveGrid.extend({
        columns: [
            {id: "id", name: "Id", field: "id", width:80},
            {id: "quantity", name: "Qty.", field: "quantity", width: 60, 
                editor: Slickback.NumberCellEditor},
            {id: "price", name: "Price", field: "price", width: 80, 
                editor: Slickback.NumberCellEditor, precision: 2},
            {id: "is_future", name: "Future?", field: "is_future", width: 40, 
                editor: Slickback.DropdownCellEditor, choices: booleanChoices },
            {id: "is_call", name: "Call?", field: "is_call", width: 40, 
                editor: Slickback.DropdownCellEditor, choices: booleanChoices},
            {id: "is_put", name: "Put?", field: "is_put", width: 40, 
                editor: Slickback.DropdownCellEditor, choices: booleanChoices},
            {id: "contractDate", name: "Contract Date", field: "contract_period", width: dateWidth,
                 formatter: Diffa.GridView.DateFormatter,
                 editor: Diffa.DateEditor},
            {id: "propagate", name: "Push to Downstream", field: "trade_id", width: dateWidth,
                 formatter: Diffa.GridView.ButtonFormatter}
        ],

        initialize: function initialize(initOptions) { 
            Diffa.Views.TradesGrid.__super__.initialize.call(this, initOptions);
            _.bindAll(this, 'propagateButtonPressed');
            this.$el.on('click', this.propagateButtonPressed);
            this.bigbus = initOptions.bigbus;
        
        },
        propagateButtonPressed: function propagateButtonPressed(evt) {
            var id = $(evt.target).attr('id');
            if (!id) return;
            var m = id.match(/^tradepusher-(.+)$/);
            if (!m) return;
            var bus = this.bigbus;
            this.collection.getByCid(m[1]).pushDownstream().then(function (riskything) {
                bus.trigger('refreshallthethings');
            });
        },
        toolTipTemplate: _.template("<dl class='details-tip'>" +
            "<dt>Trade Id:</dt><dd><%= id %></dd>" +
            "<dt>Version:</dt><dd><%= version.substr(0, 5) + '\u2026' %></dd>" +
            "<dt>Trade type:</dt><dd><%= is_future ? 'Future' : 'Option' %></dd>" +
            "<dt>Premium:</dt><dd><%= premium %></dd>" +
            "<dt>Strike:</dt><dd><%= strike %></dd>" +
            "<dt>Buy/Sell:</dt><dd><%= {B: 'Buy', S: 'Sell'}[buy_sell] %></dd>" +
            "<dt>Currency:</dt><dd><%= currency %></dd>" +
            "<dt>Option type:</dt><dd><%= option_type %></dd>" +
            "<dt>Entry Date:</dt><dd><%= [entry_date.getFullYear(), entry_date.getMonth(), entry_date.getDay()].join('-') %></dd>" +
            "<dt>Quote:</dt><dd><%= obj.quote || 'Brent' %></dd>" +
            // "<dt>Other:</dt><dd><pre><%= JSON.stringify(obj, null, 2) %></pre></dd>" +
            "</dl>"
        )
    });

    Diffa.Views.FuturesGrid = Diffa.Views.AutoSaveGrid.extend({
        columns: [
            {id: "id", name: "Id", field: "trade_id"},
            {id: "quantity", name: "Quantity", field: "quantity", 
                editor: Slickback.NumberCellEditor},
            {id: "expiry", name: "Expires", field: "expiry", width: dateWidth,
                 formatter: Diffa.GridView.DateFormatter, editor: Diffa.DateEditor},
            {id: "price", name: "Price", field: "price",
                editor: Slickback.NumberCellEditor, precision: 2},
            {id: "entry_date", name: "Entry Date", field: "entry_date", width: dateWidth,
                 formatter: Diffa.GridView.DateFormatter},
        ],
        toolTipTemplate: _.template("<dl class='details-tip'>" +
            "<dt>Trade Id:</dt><dd><%= trade_id %></dd>" +
            "<dt>Version:</dt><dd><%= version.substr(0, 5) + '\u2026' %></dd>" +
            "<dt>Quote:</dt><dd><%= quote %></dd>" +
            // "<dt>Trade type:</dt><dd><%= ttype == 'O' ? 'Option' : (ttype == 'F' ? 'Future' : 'Unknown') %></dd>" +
            "<dt>Entry Date:</dt><dd><%= [entry_date.getFullYear(), entry_date.getMonth(), entry_date.getDay()].join('-') %></dd>" +
            // "<dt>Other:</dt><dd><pre><%= JSON.stringify(obj, null, 2) %></pre></dd>" +
            "</dl>"
        )

    });

    Diffa.Views.OptionsGrid = Diffa.Views.AutoSaveGrid.extend({
            columns: [
            {id: "id", name: "Id", field: "trade_id"},
            {id: "quantity", name: "Lots", field: "quantity", 
                editor: Slickback.NumberCellEditor},
            {id: "strike", name: "Strike", field: "strike_price",
                editor: Slickback.NumberCellEditor, precision: 2},
            {id: "expiry", name: "Expires", field: "expiry", width: dateWidth,
                 formatter: Diffa.GridView.DateFormatter,
                 editor: Diffa.DateEditor},
        ],
        toolTipTemplate: _.template("<dl class='details-tip'>" +
            "<dt>Trade Id:</dt><dd><%= trade_id %></dd>" +
            "<dt>Version:</dt><dd><%= version.substr(0, 5) + '\u2026' %></dd>" +
            // "<dt>Trade type:</dt><dd><%= ttype == 'O' ? 'Option' : (ttype == 'F' ? 'Future' : 'Unknown') %></dd>" +
            "<dt>Entry Date:</dt><dd><%= [trade_date.getFullYear(), trade_date.getMonth(), trade_date.getDay()].join('-') %></dd>" +
            "<dt>Premium price:</dt><dd><%= premium_price %></dd>" +
            "<dt>Excercise Right:</dt><dd><%= exercise_right %></dd>" +
            "<dt>Excercise Type:</dt><dd><%= exercise_type %></dd>" +
            "<dt>Quote:</dt><dd><%= quote %></dd>" +
            // "<dt>Other:</dt><dd><pre><%= JSON.stringify(obj, null, 2) %></pre></dd>" +
            "</dl>"
        )

    });


    Diffa.Views.TradeErrors = Backbone.View.extend({
        initialize: function initialize(options) {
            this.collection.on('error', this.showError.bind(this));
        },

        showError: function showError(model, error, _options) {
            console.log(error);
            $('<div/>').hide().addClass('error').text(error.toString()).appendTo(this.el).slideDown().
                delay(1000).slideUp(function () {
                    $(this).remove();
                });
        }
    });

    Diffa.Views.Control = Backbone.View.extend({
        markup: '<button/>',
        render: function () {
            $(this.el).html(this.markup).find('button').text('Add Row');
        },
        initialize: function initialize(options) {
            this.render();
            this.$('button').click(this.addRow.bind(this));
        },
        addRow: function addRow() { 
            this.collection.create();
        }
    });

    Diffa.Models = Diffa.Models || {};
    var bigbus = _.clone(Backbone.Events);

    var oldSync = Backbone.sync;
    Backbone.sync = function sync (method, model, options) {
        Diffa.authToken = Diffa.authToken || $('meta[name="diffa.authToken"]').attr('content');
        options = _.extend({headers: { 'X-authToken': Diffa.authToken } }, options);
        return oldSync(method, model, options);
    };

    function GridComponent(url, baseElt, modelType, gridViewType, bigbus) {
        this.CollectionType = Slickback.Collection.extend({
            model: modelType,
            url: url,
        });
        var height = baseElt.css('height');
        // We use parseInt as it deliberately ignores the extra units at the
        // end, and there's no point worrying about units if all we care about
        // is zero.
        if (parseInt(height) == 0) { 
            height = '20em'; 
        }

        var collection = new this.CollectionType();
        bigbus.on('refreshallthethings', function() { collection.fetch() ; })
        this.collection = collection;
        

        this.tradeEntryView = new gridViewType({
            el: $('<div/>').css('height', height).appendTo(baseElt), // .find(".entry-grid"),
            collection: this.collection,
            bigbus: bigbus,
        });

        console.log("Height set to", $(this.tradeEntryView.el).css('height'), "intended", height);

        this.errorView = new Diffa.Views.TradeErrors({
            el: $('<div/>').appendTo(baseElt), 
            collection: this.collection
        });
        this.control = new Diffa.Views.Control({
            el: $('<div/>').appendTo(baseElt),
            collection: this.collection
        });
    };

    Diffa.BootstrapGrids = function Diffa_BootstrapGrids (baseUrl, baseElt) {
        console.log("bootstrap called");
        var urls = { 
            trades: baseUrl + '/trades', 
            futures: baseUrl + '/futures',
            options: baseUrl + '/options',
        };

        Diffa.tradesGrid = new (function() { 
            GridComponent.call(this,
            urls.trades, $('.trades'), 
            Diffa.Trade, Diffa.Views.TradesGrid, bigbus
        ) });

        Diffa.futuresGrid = new GridComponent(
            urls.futures, $('.futures'), 
            Diffa.Future, Diffa.Views.FuturesGrid, bigbus
        );
        Diffa.futuresGrid = new GridComponent(
            urls.options, $('.options'), 
            Diffa.Option, Diffa.Views.OptionsGrid, bigbus
        );
            
        console.log("bootstrap done");
    };
