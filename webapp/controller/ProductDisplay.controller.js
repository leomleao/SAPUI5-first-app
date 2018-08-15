// Note that this view is hosted by nw.epm.refapps.ext.prod.manage.view.S3_ProductDetail. Thus, it implements the lifecycle methods show and leave
// defined by this view.
sap.ui.define([
	"sap/ui/core/mvc/Controller",
	"sap/ui/model/json/JSONModel",
	"./SubControllerForShare",
	"./messages",
	"./utilities",
	"nw/epm/refapps/ext/prod/manage/model/formatter"
], function(Controller, JSONModel, SubControllerForShare, messages, utilities, formatter) {
	"use strict";

	return Controller.extend("nw.epm.refapps.ext.prod.manage.controller.ProductDisplay", {
		formatter: formatter,
		// --- Helper attributes that are initialized during onInit and never changed afterwards

		// _oViewProperties: json model used to manipulate declarative attributes of the controls used in this view. Initialized in _initViewPropertiesModel.
		// Contains the attribute dataLoaded which is set to true, as soon as the product is loaded
		// _oView: this view
		// _oApplicationController: the controller of the App
		// _oApplicationProperties: json model containing the App state
		// _oResourceBundle: the resource bundle to retrieve texts from
		// _oHelper: singleton instance of nw.epm.refapps.ext.prod.manage.util.Products used to call backend services
		// _oSubControllerForShare: helper for the share dialog
		// _oShareDialog: dialog for the share button. Initialized on demand.

		// --- attributes describing the current state
		// _sContextPath: Stores the currently requested context path
		// _oProduct: product currently bound to the view, it could be null if the requested product cannot be found any more or we are in the process of loading it
		// _sOldId: Store last retrieved supplier id.  Needed in cases when supplier is shown in display mode, then new supplier in edit mode

		// --- Initialization

		onInit: function() {
			// Gets the application component and the data operation helper instance
			this._oView = this.getView();
			this._initViewPropertiesModel();
			var oComponent = this.getOwnerComponent();
			this._oApplicationProperties = oComponent.getModel("appProperties");
			this._oApplicationController = this._oApplicationProperties.getProperty("/applicationController");
			this._oResourceBundle = oComponent.getModel("i18n").getResourceBundle();
			this._oHelper = this._oApplicationController.getODataHelper();
			this._oSubControllerForShare = new SubControllerForShare(this._oView, this._oResourceBundle);
			this._sContextPath = "";
			this._mSupplierDatas = {};
		},

		_initViewPropertiesModel: function() {
			// The model created here is used to set values or view element properties that cannot be bound
			// directly to the OData service. Setting view element attributes by binding them to a model is preferable to the
			// alternative of getting each view element by its ID and setting the values directly because a JSon model is more
			// robust if the customer removes view elements (see extensibility).
			this._oViewProperties = new JSONModel({
				dataLoaded: false
			});
			this._oView.setModel(this._oViewProperties, "viewProperties");
		},

		// --- Lifecycle methods used by the hosting view

		show: function() {
			var sProductId = this._oApplicationProperties.getProperty("/productId");
			if (!sProductId) {
				return;
			}
			this._oApplicationController.whenMetadataLoaded(this._show.bind(this, sProductId));
		},

		// Note: This function must not be called before the metadata have been read successfully
		_show: function(sProductId) {
			this._sContextPath = this._oHelper.getPathForProductId(sProductId);
			this._oView.bindElement(this._sContextPath);

			// 1. Check whether data is already available locally in the model
			var bProductDataAlreadyRead = this._extractProduct();
			this._oViewProperties.setProperty("/dataLoaded", bProductDataAlreadyRead);
			// 2. If the binding is not set yet, register for the data for the binding are loaded asynchronously.
			if (!bProductDataAlreadyRead) {
				this._oView.getElementBinding().attachEventOnce("dataReceived", this._getBindingDataReceivedHandler(sProductId), this);
			}
		},

		_extractProduct: function() {
			// Helper function for reading the product from the binding context and making sure it is the requested one.
			// Return the information whether a binding context was available.
			var oBindingContext = this._oView.getBindingContext();
			this._oProduct = null;
			if (oBindingContext) {
				if (oBindingContext.getPath() === this._sContextPath) {
					this._oProduct = oBindingContext.getObject();
					this._oApplicationProperties.setProperty("/lastDisplay", this._oProduct.Id);
					this._oApplicationProperties.setProperty("/detailBusyIndicatorDelay", null);
					return true;
				}
			}
			return false; // The requested product is not available in backend
		},

		_getBindingDataReceivedHandler: function(sProductID) {
			return function() {
				if (sProductID !== this._oApplicationProperties.getProperty("/productId") || !this._oView.getElementBinding()) {
					return;
				}
				var bProductDataAlreadyRead = this._extractProduct();
				if (!bProductDataAlreadyRead) {
					// Handles the case that the product cannot be retrieved remotely (such as it was already deleted).
					var sText = this._oResourceBundle.getText("ymsg.productUnavailable", [sProductID]);
					this._oApplicationController.navToEmptyPage(sText);
				}
				this._oViewProperties.setProperty("/dataLoaded", true);
			};
		},

		leave: function() {
			this._oView.unbindElement();
		},

		// --- Event handlers attached declaratively
		// User wants to open the business card of the product supplier
		onSupplierPressed: function(oEvent) {
			if (!this._oSupplierCard) {
				this._initializeSupplierCard();
			}
			this._oSupplierCard.openBy(oEvent.getSource());
		},

		_initializeSupplierCard: function() {
			var oView = this.getView();
			this._oSupplierCard = sap.ui.xmlfragment(oView.getId(), "nw.epm.refapps.ext.prod.manage.view.SupplierCard");
			this._oSupplierCard.bindElement({
				path: "Supplier"
			});
			utilities.attachControlToView(oView, this._oSupplierCard);
		},

		onCopyPressed: function() {
			this._oHelper.copyProductToDraft(this._oApplicationProperties.getProperty("/productId"), this._oApplicationController.navToProductEditPage
				.bind(
					this._oApplicationController));
		},

		onEditPressed: function() {
			this._oHelper.getProductDraftFromProductId(this._oApplicationProperties.getProperty("/productId"), this._oApplicationController.navToProductEditPage
				.bind(this._oApplicationController));
		},

		onDeletePressed: function() {
			this._oHelper.deleteProduct(this._sContextPath);
		},

		onSharePressed: function(oEvent) {
			this._oSubControllerForShare.openDialog(oEvent);
		},

		onNavButtonPress: function() {
			// Handler for the nav button of the page. It is attached declaratively. Note that it is only available on phone
			this._oApplicationController.navBack(true);
			this._oView.unbindElement();
		}
	});
});