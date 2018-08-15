// Helper class for centrally handling oData CRUD and function import services. The interface provides the business
// meanings for the application and can be reused in different places where the UI-specific actions after the call
// could still be different and will be handled in the corresponding controller of the view.
// Every (main) view of this app has an instance of this class as an attribute so that it can forward all explicit
// backend calls to it.
// Note that this class forwards all delete operations to helper class nw.epm.refapps.products.manage.model.RemoveService,
// which is instantiated on demand.
sap.ui.define([
	"sap/ui/base/Object",
	"sap/ui/model/json/JSONModel",
	"./RemoveService",
	"nw/epm/refapps/ext/prod/manage/controller/messages"
], function(Object, JSONModel, RemoveService, messages) {
	"use strict";

	return Object.extend("nw.epm.refapps.ext.prod.manage.model.Products", {
		// Attributes of this class: 
		// _oResourceBundle, _oODataModel, _oApplicationProperties, _oApplicationController, _oMainView
		// are the global objects used throughout this app
		// _fnDeleteListener: see methods deleteListener of nw.epm.refapps.ext.prod.manage.Application 
		// _oWhenNoDraft: Is a Promise that will be resolved as soon as there is no draft 
		// which is currently in the process of being deleted.
		// _fnSetBackBusyDraftState: a function that sets back the global state isBusyCreatingDraft to false
		constructor: function(oComponent, oMainView) {
			this._oResourceBundle = oComponent.getModel("i18n").getResourceBundle();
			this._oODataModel = oComponent.getModel();
			this._oApplicationProperties = oComponent.getModel("appProperties");
			this._oApplicationController = this._oApplicationProperties.getProperty("/applicationController");
			this._fnDeleteListener = this._oApplicationController.deleteListener.bind(this._oApplicationController);
			this._oMainView = oMainView;
			this._oWhenNoDraft = new Promise(function(fnResolve) {
				fnResolve(); // Since we are currently not in the process of deleting a draft, the Promise is resolved immediately
			});
			this._fnSetBackBusyDraftState = this._oApplicationProperties.setProperty.bind(this._oApplicationProperties, "/isBusyCreatingDraft",
				false);
		},

		// Note: This function must not be called before the metadata have been read successfully
		getPathForProductId: function(sProductId) {
			return this._oODataModel.createKey("/Products", {
				Id: sProductId
			});
		},

		// Note: This function must not be called before the metadata have been read successfully
		getPathForDraftId: function(sDraftId) {
			return this._oODataModel.createKey("/ProductDrafts", {
				Id: sDraftId
			});
		},

		// Delete methods are forwarded to RemoveService. The specification of these methods can be found there.

		deleteProducts: function(aPaths, fnAfterDeleted) {
			var oDeleteHelper = this._getDeleteHelper(true, true);
			oDeleteHelper.deleteProducts(aPaths, fnAfterDeleted);
		},

		deleteProduct: function(sPath, fnAfterDeleted, bWithoutConfirmationDialog) {
			var oDeleteHelper = this._getDeleteHelper(true, true);
			if (bWithoutConfirmationDialog) {
				oDeleteHelper.deleteEntityWithoutConfirmationDialog(sPath, fnAfterDeleted, true);
			} else {
				oDeleteHelper.deleteProduct(sPath, fnAfterDeleted);
			}
		},

		// Deletes a draft (possibly with confirmation dialog).
		// Note that this method reassigns _oWhenNoDraft, as a new deletion process is started.
		deleteProductDraft: function(sPath, fnAfterDeleted, fnDeleteCanceled) {
			var oDeleteHelper = this._getDeleteHelper(false, false);
			if (this._oApplicationProperties.getProperty("/isDirty")) {
				// User needs to confirm the deletion
				var fnDeleteConfirmed = function(oPromise) {
					this._setWhenNoDraft(oPromise);
					if (fnAfterDeleted) {
						fnAfterDeleted();
					}
				}.bind(this);
				oDeleteHelper.deleteProductDraft(sPath, fnDeleteConfirmed, fnDeleteCanceled);
			} else {
				this._setWhenNoDraft(oDeleteHelper.deleteEntityWithoutConfirmationDialog(sPath, null, false));
				if (fnAfterDeleted) {
					fnAfterDeleted();
				}
			}
		},

		//  assign the _oWhenNoDraft promise to oPromise and handle error handling.
		_setWhenNoDraft: function(oPromise) {
			this._oWhenNoDraft = oPromise;
			// If the deletion of the draft fails we consider ourselves to have been thrown back to the situation that
			// a lost draft may exist.
			oPromise.catch(this._oApplicationProperties.setProperty.bind(this._oApplicationProperties, "/lostDraftReadState", -1));
		},

		deleteImageDraft: function(sPath, fnAfterDeleted) {
			var oDeleteHelper = this._getDeleteHelper(false, true);
			oDeleteHelper.deleteEntityWithoutConfirmationDialog(sPath, fnAfterDeleted, false);
		},

		// Additional methods for working with products

		// Creates a product draft for a new product.
		createProductDraft: function(fnProductDraftCreated) {
			this._oApplicationProperties.setProperty("/isBusyCreatingDraft", true);
			var fnCreateDraft = function() {
				// At least one attribute must be filled in the object passed to the create call (requirement of the oData
				// service)
				var oNewProduct = {
					ProductId: ""
				};
				this._oODataModel.create("/ProductDrafts", oNewProduct, {
					success: fnProductDraftCreated,
					error: this._getErrorForProcessing("isBusyCreatingDraft")
				});
			}.bind(this);
			// The backend will not accept the creation of a new draft, when still being in the process of
			// deleting the previous one. Therefore, creating the new draft is postponed in this case.
			this._oWhenNoDraft.then(fnCreateDraft, this._fnSetBackBusyDraftState);
		},

		// This method checks whether the user currently possesses a draft.
		// fnHandleDraftId is called when this information has been retrieved.
		// When a draft was found the id of the draft and the whole draft object are
		// transferred as parameters to fnHandleDraft. Otherwise fnHandleDraft is called
		// with faulty parameters.
		readProductDraft: function(fnHandleDraft, fnError) {
			var fnSuccess = function(oResponseContent) {
				var oProductDraft = oResponseContent.results[0];
				var sDraftId = oProductDraft && oProductDraft.Id;
				fnHandleDraft(sDraftId, oProductDraft);
			};
			this._oODataModel.read("/ProductDrafts", {
				success: fnSuccess,
				error: fnError
			});
		},

		// delete a draft without user interaction
		deleteDraft: function(sDraftId, fnAfterDeleted) {
			this._oApplicationProperties.setProperty("/isDirty", false);
			var sProductDraftPath = this._oODataModel.createKey("ProductDrafts", {
				Id: sDraftId
			});
			this.deleteProductDraft(sProductDraftPath, fnAfterDeleted, null);
		},

		// Creates product draft from a specified product ID for CopyProduct
		copyProductToDraft: function(sProductId, fnNavToDraft) {
			this._callFunctionAndNavToProductDraft("/CopyProduct", sProductId, fnNavToDraft);
		},

		// Gets product draft from a specified product ID for EditProduct
		getProductDraftFromProductId: function(sProductId, fnNavToDraft) {
			this._callFunctionAndNavToProductDraft("/EditProduct", sProductId, fnNavToDraft);
		},

		_callFunctionAndNavToProductDraft: function(sFunctionName, sProductId, fnNavToDraft) {
			// Calls function import EditProduct or CopyProduct
			this._oApplicationProperties.setProperty("/isBusyCreatingDraft", true);
			// The next draft must not be created before the deletion of the previous draft has been executed
			var fnCreateDraft = function() {
				this._callFunctionImport(sFunctionName, {
					ProductId: sProductId
				}, function(oResponseContent) {
					if (oResponseContent && oResponseContent.Id) {
						fnNavToDraft(oResponseContent.Id);
					}
				}, "isBusyCreatingDraft");
			}.bind(this);
			this._oWhenNoDraft.then(fnCreateDraft, this._fnSetBackBusyDraftState);
		},

		// Convenience method for calling function imports. Provides error handling.
		_callFunctionImport: function(sFunctionName, oURLParameters, fnAfterFunctionExecuted, sProcessingProperty) {
			this._oODataModel.callFunction(sFunctionName, {
				method: "POST",
				urlParameters: oURLParameters,
				success: fnAfterFunctionExecuted,
				error: this._getErrorForProcessing(sProcessingProperty)
			});
		},

		// Turns ProductDraft into Product and deletes ProductDraft
		activateProduct: function(fnDraftSaved, fnAfterActivation) {
			this._oApplicationProperties.setProperty("/isBusySaving", true);
			var fnResetBusy = function() {
				this._oApplicationProperties.setProperty("/isBusySaving", false);
			}.bind(this);
			this.oDraftToActivate = {
				sDraftId: this._oApplicationProperties.getProperty("/productId"),
				fnAfterActivation: fnAfterActivation
			};
			this._submitChanges(fnResetBusy, fnDraftSaved);
		},

		// Saves ProductDraft each time a user edits a field
		saveProductDraft: function(fnAfterSaved) {
			this._submitChanges(null, fnAfterSaved);
		},

		_submitChanges: function(fnSaveFailed, fnAfterSaved) {
			if (this._bIsChanging) {
				return;
			}
			if (this._oODataModel.hasPendingChanges()) {
				this._sMessage = null;
				var fnSuccess = function(oResponseData) {
					this._bIsChanging = false;
					if (!this._oODataModel.hasPendingChanges() || !this._sMessage) {
						var i;
						for (i = 0; i < oResponseData.__batchResponses.length && !this._sMessage; i++) {
							var oEntry = oResponseData.__batchResponses[i];
							if (oEntry.response) {
								this._sMessage = messages.extractErrorMessageFromDetails(oEntry.response.body);
							}
						}
					}
					if (this._sMessage) {
						fnAfterSaved(this._sMessage);
					} else {
						this._submitChanges(fnSaveFailed, fnAfterSaved);
					}
				}.bind(this);
				this._bIsChanging = true;
				var oParameters = {
					success: fnSuccess,
					error: fnSaveFailed,
					batchGroupId: "editproduct"
				};
				this._oODataModel.submitChanges(oParameters);
			} else if (this.oDraftToActivate) {
				if (this._sMessage) {
					this._oApplicationProperties.setProperty("/isBusySaving", false);
				} else {
					this._callFunctionImport("/ActivateProduct", {
						ProductDraftId: this.oDraftToActivate.sDraftId
					}, this.oDraftToActivate.fnAfterActivation, "isBusySaving");

				}
				this.oDraftToActivate = null;
			}
		},

		saveSelectProductDraft: function() {
			this._oODataModel.submitChanges(null, this.onSubmitDraftErrorSelect);
		},

		onSubmitDraftErrorSelect: function(oError) {
			// Currently no valueStateText for Select Control, but will be delivered by UI5 in v 26
			messages.showErrorMessage(oError, this._oMainView);
		},

		// This method is called when a modifying process has run onto an error.
		// sProcessingProperty is the global property which is currently true making the app busy
		// and which therefore must now be reset to false.
		_getErrorForProcessing: function(sProcessingProperty) {
			return function(oError) {
				this._oApplicationProperties.setProperty("/" + sProcessingProperty, false);
				messages.showErrorMessage(oError, this._oMainView);
			}.bind(this);
		},

		// Convenience method for retrieving an instance of the RemoveService
		_getDeleteHelper: function(bCallDeleteListener, bWithBusyDialog) {
			return new RemoveService(this._oODataModel, this._oResourceBundle, this._oApplicationProperties,
				this._getErrorForProcessing("isBusyDeleting"), bCallDeleteListener && this._fnDeleteListener, bWithBusyDialog);
		}
	});
});