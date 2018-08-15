sap.ui.define([
	"sap/ui/base/Object",
	"sap/ui/Device",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/odata/v2/ODataModel",
	"./NavigationManager",
	"./messages",
	"./utilities",
	"nw/epm/refapps/ext/prod/manage/model/Products",
	"nw/epm/refapps/ext/prod/manage/model/formatter"
], function(Object, Device, JSONModel, ODataModel, NavigationManager, messages, utilities, Products, formatter) {
	"use strict";

	function fnInitBusyHandling(oApplicationProperties) {
		// This function is called in the initialization phase. It ensures that the busy state of the app is set correctly.
		// oApplicationProperties is the global application model (see below). This model contains a property isAppBusy
		// which is declaratively bound to the busy state of the app (see view nw.epm.refapps.ext.prod.manage.view.App).
		// Actually there are several reasons which make the app busy. All of them can be expressed via properties handled
		// by the global application model. E.g. the app should be busy when isBusyDeleting is true.
		// Therefore, in this function we register for changes of any of those properties influencing the busy state.   
		var mBusyReasons = { // A map of the global properties influencing the busy state onto the value which makes the app busy
				isBusyDeleting: true,
				isBusyCreatingDraft: true,
				isBusySaving: true,
				metaDataLoadState: 0,
				lostDraftReadState: 0
			},
			fnRefreshBusyState = function() { // function which is called when a property influencing the busy state is modified
				var bIsBusy = false; // information whether app should be busy now. First assumption: app is not busy
				for (var sProp in mBusyReasons) { // check whether we find any reason for being busy
					var vExpected = mBusyReasons[sProp];
					var vValue = oApplicationProperties.getProperty("/" + sProp);
					if (vExpected === vValue) { // ok, the app is busy
						bIsBusy = true;
						// We set the app to busy now. When this busy state ends we will still
						// have to re determine the detail area. Since we want to avoid
						// a flickering of busy indicators we ensure that the busy indicator
						// of the detail area becomes busy immediately.
						oApplicationProperties.setProperty("/detailBusyIndicatorDelay", 0);
						break;
					}
				}
				oApplicationProperties.setProperty("/isAppBusy", bIsBusy);
			};
		// Now register fnRefrechBusyState to changes of all properties contained in mBusyReasons
		for (var sProperty in mBusyReasons) {
			var oBinding = oApplicationProperties.bindProperty("/" + sProperty);
			oBinding.attachChange(fnRefreshBusyState);
		}
	}

	return Object.extend("nw.epm.refapps.ext.prod.manage.controller.Application", {
		// This class serves as controller for the whole App. It is a singleton object which is initialized by the Component.
		// Since the Component exposes a reference to this singleton object all controllers have access to it and can use its public methods.
		// On the other hand the S2 and the S3 view register at this singelton on startup, such that it can call public methods of these controllers
		// if necessary.

		// --- the following attributes are initialized during startup and not changed afterwards
		// _oComponent: the Component (nw.epm.refapps.ext.prod.manage.Component)
		// _mRoutes: Access the routenames (see Component)
		// _oResourceBundle: the resource bundle used by this app
		// _oModel: the OData model used by this App
		// _oApplicationProperties: a JSON model used to share global state between the classes used in this App
		// it possesses the following attributes:
		// applicationController - this instance
		// serviceUrl            - the url of the OData service used by this app
		// isMultiSelect         - is the App in multi select mode
		// metaDataLoadState     - 0: meta data loading, 1: meta data loading was successful, -1 metadata loading failed
		// lostDraftReadState    - 0: reading lost draft, 1: lost draft info read successfully, -1 none of them
		// isBusyDeleting, isBusyCreatingDraft, isBusySaving
		//                       - busy states of the app
		// isAppBusy             - information whether the app as a whole is busy. Its state is dervied from
		//                         other states (see fnInitBusyHandling)
		// detailBusyIndicatorDelay, masterBusyIndicatorDelay
		//                       - busy delays for master and detail view. They are either 0 (no delay) or null (default delay)
		// noEditMode            - is the App in display mode,
		// productId             - if this attribute is truthy it contains the id of the product to be displayed currently
		// preferredIds          - this attribute is only evaluated when productId is faulty. In this case it contains an
		//                         array of product ids. The first of these ids corresponding to an item in the master list
		//                         will be displayed
		// isDirty               - flag indicating whether the current draft is dirty. Only relevant in edit scenarios.
		// lastDisplay           - id of the last product that was shown in display screen
		// isListLoading         - information whether the master list is currently loading
		// listNoDataText        - the noDataText currently applicable for the master list
		// emptyText             - text to be shown on the empty page
		// _oNavigationManager: instance of nw.epm.refapps.ext.prod.manage.controller.NavigationManager responsible for handling navigation
		// _oDataHelper: instance of nw.epm.refapps.ext.prod.manage.model.Products used to perform explicit backend calls
		// _oMasterController: controller of nw.epm.refapps.ext.prod.manage.view.S2_ProductMaster
		// _oOnMetaData: an instance which possesses arrays onSuccess and onFailure as members. The elements of these arrays are functions, 
		// which will be executed according to whether the loading of the metadata was successful or failure.
		// As soon as the metadata have been loaded successfully the attribute will not be used anymore (and thus set to null).

		// --- Lifecycle methods

		// - Methods called during application startup. Note that the methods will be called in the following
		//   order: constructor, init, registerMaster, onRoutePatternMatched (of NavigationManager), onMetadataLoaded.
		//   The point in time when registerDetail is called depends on the route which is used to start the App.

		constructor: function(oComponent, mRoutes) {
			this._oComponent = oComponent;
			this._mRoutes = mRoutes;
		},

		init: function(sServiceUrl) {
			this._oMainView = this._oComponent.getAggregation("rootControl");

			this._oOnMetaData = {
				onSuccess: [],
				onFailure: []
			};
			var oODataModel = this._oComponent.getModel();
			oODataModel.attachMetadataLoaded(this.onMetadataLoaded, this);
			oODataModel.attachMetadataFailed(this.onMetadataFailed, this);

			this._oApplicationProperties = new JSONModel({
				serviceUrl: sServiceUrl,
				metaDataLoadState: 0,
				lostDraftReadState: -1,
				isBusyDeleting: false,
				isBusyCreatingDraft: false,
				isBusySaving: false,
				isAppBusy: true,
				detailBusyIndicatorDelay: 0,
				masterBusyIndicatorDelay: 0,
				applicationController: this,
				isMultiSelect: false,
				noEditMode: true,
				preferredIds: [],
				isDirty: false,
				lastDisplay: null,
				isListLoading: false,
				listNoDataText: " "
			});
			this._oComponent.setModel(this._oApplicationProperties, "appProperties");
			fnInitBusyHandling(this._oApplicationProperties);
			this._oDataHelper = new Products(this._oComponent, this._oMainView);

			var oRouter = this._oComponent.getRouter();
			this._oNavigationManager = new NavigationManager(oRouter, this._oApplicationProperties, this._mRoutes, this._oComponent.getModel(
				"i18n").getResourceBundle());
			this._oNavigationManager.init();
			this._extractStartupParameters(oRouter);
		},

		_extractStartupParameters: function(oRouter) {
			// handle the case that App was reached via Cross App navigation
			var oComponentData = this._oComponent.getComponentData();
			if (oComponentData && oComponentData.startupParameters && jQuery.isArray(oComponentData.startupParameters.Product) &&
				oComponentData.startupParameters.Product.length > 0) {
				var sUrl = oRouter.getURL(this._mRoutes.DETAIL, {
					productID: oComponentData.startupParameters.Product[0]
				});
				if (sUrl) {
					sap.ui.require(["sap/ui/core/routing/HashChanger"], function(HashChanger) {
						var oHashChanger = HashChanger.getInstance();
						oHashChanger.replaceHash(sUrl);
					});
				}
			}
		},

		registerMaster: function(oMasterController) {
			// This method is called in onInit() of the S2-view
			this._oMasterController = oMasterController;
			this._oNavigationManager.registerMaster(oMasterController);
		},

		registerDetail: function(oDetailController) {
			// This method is called in onInit() of the S3-view
			this._oNavigationManager.registerDetail(oDetailController);
		},

		onMetadataLoaded: function() {
			// In normal scenarios this method is called at the end of the startup process. However, in cases that initial loading of
			// metadata fails, this method may be called later. It is registered in init().
			this._checkForLostDraft();
			this._oApplicationProperties.setProperty("/metaDataLoadState", 1);
			this._oApplicationProperties.setProperty("/isListLoading", true);
			for (var i = 0; i < this._oOnMetaData.onSuccess.length; i++) {
				this._oOnMetaData.onSuccess[i]();
			}
			this._oOnMetaData = null;
		},

		onMetadataFailed: function() {
			this._oApplicationProperties.setProperty("/metaDataLoadState", -1);
			for (var i = 0; i < this._oOnMetaData.onFailure.length; i++) {
				this._oOnMetaData.onFailure[i]();
			}
			this._oOnMetaData = {
				onSuccess: [],
				onFailure: []
			};
		},

		// - Navigation methods are forwarded to the NavigationManager

		navBackToMasterPageInPhone: function() {
			return this._oNavigationManager.navBackToMasterPageInPhone();
		},

		showProductDetailPage: function(sProductId, bListRefresh) {
			// This method navigates to the display page for the specified product id. Note that this method must only
			// be called when either no draft exists (for the current user), or the deletion of this draft has been triggered already,
			// or the lookup for lost draft has failed.
			this._oNavigationManager.showProductDetailPage(sProductId, bListRefresh);
		},

		navToMaster: function(sPrefereredId) {
			// This method navigates to the master route. sPreferredId is an optional parameter that may contain the id of a
			// product that (on non-phone devices) is preferably shown (provided it is in the master list). Prerequisites for
			// calling this method are as for showProductDetailPage.
			this._oNavigationManager.navToMaster(sPrefereredId);
		},

		navToProductEditPage: function(sDraftId) {
			// This method navigates to the edit page for the (only existing) draft for this user. Note that this method must only
			// be called when this draft exists and its id is either passed as parameter sDraftId or is already contained in attribute
			// productId of the AppModel.
			this._oNavigationManager.navToProductEditPage(sDraftId);
		},

		navToEmptyPage: function(sText, bResetUrl) {
			// This method navigates to the empty page in detail area. Prerequisites for
			// calling this method are as for showProductDetailPage.
			// sText is the text to be shown on the empty page
			this._oNavigationManager.navToEmptyPage(sText, bResetUrl);
		},

		navBack: function(bFromDetail) {
			this._oNavigationManager.navBack(bFromDetail, this._oDataHelper);
		},

		// --- Methods dealing with lost drafts

		_checkForLostDraft: function() {
			// This method triggers the check for a lost draft. It is called directly after the metadata have been loaded.
			// If the backend call fails, this method will be called on every list refresh until it succeeds the first time.
			// Note that performing this logic in onMetaDataLoaded has two advantages:
			// - the types of the oData response for the lost draft are set correctly
			// - the call will implicitly be batched with the first call to determine the master list
			this._oApplicationProperties.setProperty("/lostDraftReadState", 0);
			var fnError = function(oResponse) {
				this._oApplicationProperties.setProperty("/lostDraftReadState", -1);
				messages.showErrorMessage(oResponse, this._oMainView);
			};
			// delegate oData call to the helper object
			this._oDataHelper.readProductDraft(this.handleLostDraft.bind(this), fnError.bind(this));
		},

		handleLostDraft: function(sDraftId, oProductDraft) {
			// This method will be called when we have successfully retrieved the information on lost drafts.
			// If a lost draft exists its id is passed in parameter sDraftId and the full object is passed in oProductDraft.
			// Otherwise both parameters are faulty.
			// Note that onRoutePatdaternMatched has been executed at this point in time.
			this._oApplicationProperties.setProperty("/lostDraftReadState", 1);
			if (sDraftId) { // a lost draft exists
				var sLastId = this._oApplicationProperties.getProperty("/productId"); // store the id of the product currently displayed (if there is one)
				if (sLastId !== sDraftId && !oProductDraft.IsDirty) { // if the lost draft is not dirty and it is not the current one
					this._oDataHelper.deleteDraft(sDraftId); // delete it without notice
					return;
				}
				this.navToProductEditPage(sDraftId); // the lost draft is either dirty or belonging to the product currently displayed -> go to its edit page
				if (sLastId === sDraftId) { // if the user was working on this product anyway we are done
					this._oApplicationProperties.setProperty("/isDirty", oProductDraft.IsDirty); // but update the global isDirty-property first
					return;
				}
				// User has a lost (dirty) draft belonging to another object than he is currently looking at.
				// -> he must either edit this draft or revert it
				var oDialog,
					fnDiscarded = function() { // this method is called when the user decides to revert the draft
						oDialog.close();
						this._oDataHelper.deleteDraft(sDraftId); // delete the draft
						if (sLastId) { // preferably go back to the product we were working on before
							this.showProductDetailPage(sLastId);
						} else { // Otherwise we prefer to display the product we had in edit screen, if possible
							this.navToMaster(!oProductDraft.IsNew && sDraftId);
						}
					}.bind(this),
					fnResumed = function() {
						this._oApplicationProperties.setProperty("/isDirty", true); // the draft is already dirty
						oDialog.close(); // when the user wants to resume the draft, we are already on the right screen
					}.bind(this);

				oDialog = sap.ui.xmlfragment("nw.epm.refapps.ext.prod.manage.view.LostDraftDialog", {
					oResourceBundle: this._oComponent.getModel("i18n").getResourceBundle(),
					formatter: formatter,
					onDiscard: fnDiscarded,
					onResume: fnResumed
				});
				utilities.attachControlToView(this._oMainView, oDialog);
				var oDraftModel = new JSONModel({
					productDraft: oProductDraft
				});
				oDialog.setModel(oDraftModel, "draft");
				oDialog.open();
			}
		},

		// --- Methods dealing with deletion of products

		deleteListener: function(bBeforeDelete, aPaths) {
			// This function deals with deleting of products.
			// It must be called twice for every delete operations performed on products (not for other entities like product drafts).
			// The first time it is called is before the delete operation is performed.
			// The second time is, after the delete operation has been performed successfully (at least partially)
			// -bBeforeDelete denotes the information which case applies
			// -aPaths is the array of product ids to be deleted
			if (bBeforeDelete) {
				this._beforeDelete(aPaths);
			} else {
				this._afterDelete();
			}
		},

		_beforeDelete: function(aPaths) {
			// called immediately before products are deleted.
			// The task of this method is to predefine the object which should be displayed after the deletion process.
			// This is done by setting the attributes productId and preferredIds ain the AppModel.
			// Thereby, the logic is as follows: If the item that is currently displayed is not to be deleted it should stay the the seletced one.
			// Otherwise, we build a list of preferred entries. Thereby, we prefer to take the list items being currently behind the current item.
			// As a second preference we take those items in front of the present one (starting with the last).
			// Note that we also consider items which shall be deleted, as the deletion may fail partially.
			var sCurrentId = !Device.system.phone && this._oApplicationProperties.getProperty("/productId");
			this._oApplicationProperties.setProperty("/productId", null);
			if (sCurrentId) {
				var bCurrentWillBeDeleted = false,
					sCurrentPath = this._oDataHelper.getPathForProductId(sCurrentId);
				for (var i = 0; !bCurrentWillBeDeleted && i < aPaths.length; i++) {
					bCurrentWillBeDeleted = sCurrentPath === aPaths[i];
				}
				if (!bCurrentWillBeDeleted) {
					this._oApplicationProperties.setProperty("/productId", sCurrentId);
					return;
				}
			}
			if (this._oMasterController) {
				this._oMasterController.prepareForDelete(sCurrentId);
			}
		},

		// Called immediately after a successfull deletion of products has taken place.
		_afterDelete: function() {
			this.navBackToMasterPageInPhone();
			if (!this._oApplicationProperties.getProperty("/isListLoading")) {
				this._oMasterController.findItem();
			}
		},

		// --- Methods to be called by the controllers

		getODataHelper: function() {
			// Returns the (singleton) helper for handling oData operations in this application
			return this._oDataHelper;
		},

		// This method can be called when another action depends on the fact that the metadata have been loaded successfully.
		// More precisely the contract of this method is as follows:
		// - when the metadata have already been loaded successfully fnMetadataLoaded is executed immediately.
		//   Moreover in this case the check for lost draft would be triggered once more if it has failed before
		// - In case the metadata have not yet been loaded successfully, it is once more tried to load the metadata.
		//   fnMetadataLoaded will be called when the metadata have been loaded succesfully, whereas fnNoMetadata will
		//   be called when the metadata loading has failed.
		// - When the method is called while the metadata are still loading, fnMetaDataLoaded and fnNoMetadata will override
		//   functions which jhave been provided by previous calls. However, this cannot happen, since the App is busy
		//   while metadata are loading.
		whenMetadataLoaded: function(fnMetadataLoaded, fnNoMetadata) {
			var iMetadataLoadState = this._oApplicationProperties.getProperty("/metaDataLoadState");
			if (iMetadataLoadState === 1) {
				if (fnMetadataLoaded) {
					fnMetadataLoaded();
				}
				if (this._oApplicationProperties.getProperty("/lostDraftReadState") < 0) {
					this._checkForLostDraft();
				}
			} else {
				if (fnMetadataLoaded) {
					this._oOnMetaData.onSuccess.push(fnMetadataLoaded);
				}
				if (fnNoMetadata) {
					this._oOnMetaData.onFailure.push(fnNoMetadata);
				}
				if (iMetadataLoadState === -1) {
					this._oApplicationProperties.setProperty("/metaDataLoadState", 0);
					this._oComponent.getModel().refreshMetadata();
				}
			}
		},

		// This method is only important in portrait mode on a tablet. There it hides the master list.
		hideMasterInPortrait: function() {
			this._oMainView.getController().hideMaster();
		}
	});
});