sap.ui.define([
	"sap/ui/base/Object",
	"sap/ui/Device",
	"sap/ui/core/routing/History"
], function(Object, Device, History) {
	"use strict";

	return Object.extend("nw.epm.refapps.ext.prod.manage.controller.NavigationManager", {
		// _oRouter: The router of this app
		// _oApplicationProperties: global state model of the App
		// _mRoutes: The routes used by this app
		// _oResourceBundle: The resource bundle used by this app
		// _oMasterController, _oDetailController: Controllers of S2 and S3 view
		// _bSubControllersMustBeAdapted: this attribute is used to distinguish between hash changes performed
		// programmatically (via method _executeNavigation) and hash changes performed by the user.
		// For changes performed programmatically the detail controller has already been updated beforehand.
		// Therefore, onRoutePatternMatched needs not to care for this.

		constructor: function(oRouter, oApplicationProperties, mRoutes, oResourceBundle) {
			this._oRouter = oRouter;
			this._oApplicationProperties = oApplicationProperties;
			this._mRoutes = mRoutes;
			this._oResourceBundle = oResourceBundle;
		},

		init: function() {
			this._bSubControllersMustBeAdapted = true;
			this._oRouter.getTargetHandler().setCloseDialogs(false);
			this._oRouter.attachRoutePatternMatched(this.onRoutePatternMatched, this);
			this._oRouter.attachBypassed(this.onBypassed, this);
			// Router is initialized at the end, since this triggers the instantiation of the views.
			// In onInit of the views we want to rely on the component being correctly initialized.
			this._oRouter.initialize();
		},

		registerMaster: function(oMasterController) {
			// This method is called in onInit() of the S2-view
			this._oMasterController = oMasterController;
		},

		registerDetail: function(oDetailController) {
			// This method is called in onInit() of the S3-view
			this._oDetailController = oDetailController;
		},
		// - Navigation methods

		onRoutePatternMatched: function(oEvent) {
			// This method is registered at the router. It will be called whenever the url-hash changes. Note that there may be two reasons
			// for this. The hash may be set by the browser (e.g. if the user follows a link leading to this App) or by the router itself.
			// The second case applies when the App calls a navigation method of the router itself.
			var sRoute = oEvent.getParameter("name"),
				sProductId = (sRoute === this._mRoutes.DETAIL) && decodeURIComponent(oEvent.getParameter("arguments").productID);
			this._oApplicationProperties.setProperty("/productId", sProductId);
			if (sProductId) {
				if (this._bSubControllersMustBeAdapted) {
					this._newProductId();
				}
				this._oMasterController.adaptToDetailSelection(this._bSubControllersMustBeAdapted);
			}
			this._bSubControllersMustBeAdapted = true;
		},

		// called for invalid url-hashes
		onBypassed: function() {
			this._oApplicationProperties.setProperty("/productId", "-");
			this._oApplicationProperties.setProperty("/emptyText", this._oResourceBundle.getText("ymsg.pageNotFound"));
			this._oMasterController.adaptToDetailSelection(false);
		},

		_newProductId: function() {
			// helper method, that informs detail controller that a new product id has been selected
			// Thereby, detail controller needs to check whether it has to change between display and edit mode.
			if (this._oDetailController && !this._oDetailController.editModeChanged()) {
				this._oDetailController.productChanged();
			}
		},

		navBackToMasterPageInPhone: function() {
			// Navigates back to the master page on phone, return true for the phone case, return false for other cases
			if (Device.system.phone) {
				this.navToMaster();
				return true;
			}
			return false;
		},

		showProductDetailPage: function(sProductId, bListRefresh) {
			// This method navigates to the display page for the specified product id. Note that this method must only
			// be called when either no draft exists (for the current user), or the deletion of this draft has been triggered already,
			// or the lookup for lost draft has failed.
			this._oApplicationProperties.setProperty("/productId", sProductId);
			this._changeEditMode(false);
			if (bListRefresh) {
				this._oMasterController.listRefresh();
			}
			this._oMasterController.adaptToDetailSelection();
			if (this._oDetailController) {
				this._oDetailController.productChanged();
			}
			this._executeNavigation(this._mRoutes.DETAIL, {
				productID: encodeURIComponent(sProductId)
			}, !Device.system.phone); // true: hash should not be stored in the history
		},

		navToMaster: function(sPrefereredId) {
			// This method navigates to the master route. sPreferredId is an optional parameter that may contain the id of a
			// product that (on non-phone devices) is preferably shown (provided it is in the master list). Prerequisites for
			// calling this method are as for showProductDetailPage.
			this._executeNavigation(this._mRoutes.MASTER, {}, true);
			this._oApplicationProperties.setProperty("/preferredIds", sPrefereredId ? [sPrefereredId] : []);
			this._oApplicationProperties.setProperty("/productId", null);
			this._changeEditMode(false);
			this._oMasterController.findItem();
		},

		navToProductEditPage: function(sDraftId) {
			// This method navigates to the edit page for the (only existing) draft for this user. Note that this method must only
			// be called when this draft exists and its id is either passed as parameter sDraftId or is already contained in attribute
			// productId of the AppModel.
			if (sDraftId) {
				this._oApplicationProperties.setProperty("/productId", sDraftId);
			} else {
				sDraftId = this._oApplicationProperties.getProperty("/productId");
			}
			this._changeEditMode(true);
			this._executeNavigation(this._mRoutes.DETAIL, {
				productID: encodeURIComponent(sDraftId)
			}, !Device.system.phone);
			this._oMasterController.adaptToDetailSelection();
		},

		_changeEditMode: function(bIsEdit) {
			// This method sets the edit mode of the App as specified by parameter bIsEdit
			if (this._oApplicationProperties.getProperty("/noEditMode") !== bIsEdit) {
				return;
			}
			this._oApplicationProperties.setProperty("/noEditMode", !bIsEdit);
			if (this._oDetailController) {
				this._oDetailController.editModeChanged();
			}
		},

		navToEmptyPage: function(sText, bResetUrl) {
			// This method navigates to the empty page in detail area. Prerequisites for
			// calling this method are as for showProductDetailPage.
			// sText is the text to be shown on the empty page
			// bResetUrl defines whether the route should be set back to the master route
			this._oApplicationProperties.setProperty("/emptyText", sText);
			if (bResetUrl) {
				// Set back the route to the generic one
				this._executeNavigation(this._mRoutes.MASTER);
			}
			this._oRouter.getTargets().display("empty");
		},

		navBack: function(bFromDetail, oDataHelper) {
			if (this._oApplicationProperties.getProperty("/noEditMode")) {
				this._navBackImpl(bFromDetail);
			} else {
				var sPath = oDataHelper.getPathForDraftId(this._oApplicationProperties.getProperty("/productId"));
				oDataHelper.deleteProductDraft(sPath, this._navBackImpl.bind(this, bFromDetail));
			}
		},

		_navBackImpl: function(bFromDetail) {
			var oHistory = History.getInstance(),
				sPreviousHash = oHistory.getPreviousHash();
			//The history contains a previous entry
			this._changeEditMode(false);
			if (typeof sPreviousHash !== "undefined") {
				history.go(-1);
			} else if (bFromDetail) {
				this.navToMaster();
			} else {
				// navigate back to FLP home
				var oCrossAppNavigator = sap.ushell && sap.ushell.Container && sap.ushell.Container.getService("CrossApplicationNavigation");
				if (oCrossAppNavigator) {
					oCrossAppNavigator.toExternal({
						target: {
							shellHash: "#"
						}
					});
				}
			}
		},

		_executeNavigation: function(sName, oParameters, bReplace) {
			// This method wraps the navTo-method of the router. It is called for navigation performed programmatically.
			// Thus, we expect that the subcontrollers have already been informed. So _bSubControllersMustBeAdapted is
			// set to false which is evaluated in onRoutePatternMatched.
			// However, there is one exception: If the detail controller was not registered at this point in time, adapting
			// it had to be postponed.
			this._bSubControllersMustBeAdapted = !this._oDetailController;
			this._oRouter.navTo(sName, oParameters, bReplace);
		}
	});
});