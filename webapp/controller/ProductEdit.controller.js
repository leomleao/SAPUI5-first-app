// Note that this view is hosted by nw.epm.refapps.ext.prod.manage.view.S3_ProductDetail. Thus, it implements the lifecycle methods show and leave
// defined by this view.
sap.ui.define([
	"sap/ui/core/mvc/Controller",
	"sap/ui/core/Component",
	"sap/ui/model/json/JSONModel",
	"sap/ui/comp/odata/MetadataAnalyser",
	"sap/ui/comp/providers/ValueHelpProvider",
	"sap/ui/model/Sorter",
	"sap/ui/Device",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterType",
	"sap/ui/model/FilterOperator",
	"sap/ui/core/ValueState",
	"./SubControllerForShare",
	"nw/epm/refapps/ext/prod/manage/model/formatter"
], function(Controller, Component, JSONModel, MetadataAnalyser, ValueHelpProvider, Sorter, Device, Filter, FilterType, FilterOperator,
	ValueState, SubControllerForShare, formatter) {
	"use strict";

	// This method returns an array that contains all entries of the array aArray that are truthy (in the same order).
	// If all entries of aArray are truthy it is returned, otherwise a new array is returned.
	function fnArrayFilteredTruthy(aArray) {
		var aCopy = null;
		for (var i = 0; i < aArray.length; i++) {
			var oEntry = aArray[i];
			if (oEntry) {
				if (aCopy) {
					aCopy.push(oEntry);
				}
			} else if (!aCopy) {
				aCopy = aArray.slice(0, i);
			}
		}
		return aCopy || aArray;
	}

	return Controller.extend("nw.epm.refapps.ext.prod.manage.controller.ProductEdit", {
		formatter: formatter,
		// --- Helper attributes that are initialized during onInit and never changed afterwards

		// _oViewProperties: json model used to manipulate declarative attributes of the controls used in this view. Initialized in _initViewPropertiesModel.
		// Contains the attribute dataLoaded which is set to true, as soon as the product is loaded
		// _oView: this view
		// _aInputFields:
		// _aMandatoryFields
		// _oApplicationController: the controller of the App
		// _oApplicationProperties: json model containing the App state
		// _oResourceBundle: the resource bundle to retrieve texts from
		// _oHelper: singleton instance of nw.epm.refapps.ext.prod.manage.util.Products used to call backend services
		// _oSubControllerForShare: helper for the share dialog
		// _oSubcategory: input field for the subcategory
		// _oShareDialog: dialog for the share button. Initialized on demand.

		// --- attributes describing the current state
		// _sContextPath:

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
			this._oCategory = this.byId("categoryBox");
			this._oSubcategory = this.byId("subcategoryBox");
			// Gets and stores array of input fields and mandatory fields
			this._aMandatoryFields = this._getMandatoryFields();
			this._aInputFields = this._aMandatoryFields.concat(this._getNonMandatoryInputFields());

			// Initialize the Sub-View which included the sap.m.UploadCollection control to handle uploading and removing
			// images
			this._initSubViewImageUpload();

			var oModel = oComponent.getModel();
			// This facilitates the value help generated from annotations only
			oModel.attachMetadataLoaded(function() {
				var oInput = this.byId("supplierInput"),
					oMetadataAnalyzer = new MetadataAnalyser(oModel),
					sField = "SupplierName",
					mConfig = oComponent.getMetadata().getConfig(),
					sServiceName = mConfig.serviceConfig.name,
					sAnnotationPath = sServiceName + ".ProductDraft/" + sField,
					oValueListAnnotations = oMetadataAnalyzer.getValueListAnnotation(sAnnotationPath);

				if (oInput) {
					// This is created for side effects Search Help Dialog
					/* eslint-disable */
					new ValueHelpProvider({
						annotation: oValueListAnnotations.primaryValueListAnnotation,
						additionalAnnotations: oValueListAnnotations.additionalAnnotations,
						control: oInput,
						model: oModel,
						preventInitialDataFetchInValueHelpDialog: true,
						supportMultiSelect: false,
						supportRanges: false,
						fieldName: sField,
						title: sField
					});
					/* eslint-enable */
					oInput.setShowValueHelp(true);
				}
			}, this);
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

		_getMandatoryFields: function() {
			return fnArrayFilteredTruthy([this.byId("productNameInput"), this.byId("priceInput"), this.byId("currencyBox"),
				this._oCategory, this._oSubcategory, this.byId("descriptionArea"),
				this.byId("supplierInput"), this.byId("unitOfMeasureBox")
			]);
		},

		_getNonMandatoryInputFields: function() {
			return fnArrayFilteredTruthy([this.byId("lengthInput"), this.byId("widthInput"), this.byId("heightInput"), this.byId("weightInput")]);
		},

		// helper method to set image upload control
		_initSubViewImageUpload: function() {
			var oSubViewImagesUpload = this.byId("View_ImageUpload");
			if (oSubViewImagesUpload) {
				oSubViewImagesUpload.getController().setInitData({
					oResourceBundle: this._oResourceBundle,
					oDataHelper: this._oHelper,
					fnDirty: this._setDirty.bind(this)
				});
			}
		},

		// --- Lifecycle methods used by the hosting view

		show: function() {
			var sProductDraftID = this._oApplicationProperties.getProperty("/productId");
			this._oViewProperties.setProperty("/dataLoaded", false);
			this._resetValueStates();

			this._sContextPath = this._oHelper.getPathForDraftId(sProductDraftID);
			// Binds the (newly generated) product draft to the view and expands the Images part for the subview
			// ProductDraftUploadImages
			this._oView.bindElement(this._sContextPath, {
				expand: "Images"
			});

			// Checks if the binding context is already available locally. If so, refreshes the binding and retrieves the
			// data from backend again.
			var oBindingContext = this._oView.getBindingContext();
			if (oBindingContext && oBindingContext.getPath() === this._sContextPath) {
				this._oView.getElementBinding().refresh();
			}

			// Updates header and footer after the product draft is retrieved
			this._oView.getElementBinding().attachEventOnce(
				"dataReceived",
				function() {
					oBindingContext = this._oView.getBindingContext();
					if (oBindingContext) {
						// Sets the draft dirty flag based on the backend information
						this._oApplicationProperties.setProperty("/isDirty", oBindingContext.getProperty("IsDirty"));

						this._oViewProperties.setProperty("/dataLoaded", true);
						// in ComboBox
						this._setCategoryFilter(oBindingContext);
					} else {
						// Handle the case if the product draft cannot be retrieved remotely (e.g. it's deleted already)
						// show the corresponding product detail page, since in this app the draft id is supposed to be
						// same as the product id
						this._oApplicationController.showProductDetailPage(sProductDraftID);
					}
					this._oApplicationProperties.setProperty("/isBusyCreatingDraft", false);
				}, this);
		},

		leave: function() {
			this._oView.unbindElement();
		},

		// --- Event handlers attached declaratively

		onSavePressed: function() {
			if (!this._checkAndMarkEmptyMandatoryFields() && !this._fieldWithErrorState()) {
				var fnDraftSaved = function(oControl, oResponse) {
						// When the batch of requests in oData V2 is successfully sent to the backend,
						// the mParameters.success in submitChanges is called. Errors relating to the
						// requests within the batch are not indicated separately and therefore the system must
						// check the requests contained in the batch for errors based on the request response.
						// Makes the assumption that the error returned relates to the field that has been
						// changed. This is not always the case and errors are shown in valueStateText
						// for the field that triggered the save of the draft.
						for (var i = 0; i < oResponse.__batchResponses.length; i++) {
							if (oResponse.__batchResponses[i].response) {
								if (jQuery.sap.startsWith(oResponse.__batchResponses[i].response.body, "{\"error\":")) {
									var oErrModel = new JSONModel();
									oErrModel.setJSON(oResponse.__batchResponses[i].response.body);
									var sMessage = oErrModel.getProperty("/error/message/value");
									if (oControl) {
										oControl.setValueState("Error");
										oControl.setValueStateText(sMessage);
									}
									// Just take the first error message found
									return false;
								}
							}
						}
						return true;
					},
					fnAfterActivation = function(oProductData) {
						this._oApplicationProperties.setProperty("/masterBusyIndicatorDelay", 0);
						this._oApplicationController.showProductDetailPage(oProductData.Id, true);
						this._oApplicationProperties.setProperty("/isBusySaving", false);
						var sMessage = this._oResourceBundle.getText("ymsg.saveText", oProductData.Name);
						sap.ui.require(["sap/m/MessageToast"], function(MessageToast) {
							MessageToast.show(sMessage);
						});
					}.bind(this);
				this._oHelper.activateProduct(fnDraftSaved, fnAfterActivation);
			}
		},

		onCancelPressed: function() {
			var oDraft = this._oView.getBindingContext().getObject(),
				fnNavToProductDetail = function() {
					this._oApplicationProperties.setProperty("/detailBusyIndicatorDelay", null);
					// The system must distinguish between CANCEL chosen in EDIT mode and CANCEL chosen in ADD mode
					// because Cancel Edit navigates to display of that product and Cancel Add to the previously
					// selected product
					var bIsNew = oDraft.IsNewProduct,
						sProductId = bIsNew ? (!Device.system.phone && this._oApplicationProperties.getProperty("/lastDisplay")) : oDraft.ProductId;
					if (sProductId) {
						this._oApplicationController.showProductDetailPage(sProductId);
					} else {
						this._oApplicationController.navToMaster();
					}
				}.bind(this);
			this._deleteProductDraft(fnNavToProductDetail);
		},

		onSharePressed: function(oEvent) {
			this._oSubControllerForShare.openDialog(oEvent);
		},

		onNavButtonPress: function() {
			this._oApplicationController.navBack(true);
		},

		// deleteProductDraft is used in this controller to cancel editing and when
		// the active product has been updated or created.
		_deleteProductDraft: function(fnAfterDeleted, fnDeleteCanceled) {
			this._oHelper.deleteProductDraft(this._sContextPath, fnAfterDeleted, fnDeleteCanceled);
		},

		// --- Input fields

		onNumberChange: function(oEvent) {
			// If a number field is empty, an error occurs in the backend.
			// So this sets a missing number to "0".
			var oField = oEvent.getSource(),
				sNumber = oField.getValue();
			if (sNumber === "") {
				oField.setValue("0");
			}
			this._fieldChange(oField);
		},

		onCategoryChange: function(oEvent) {
			// Do not use submitChanges because the subcategory determines the category and both
			// end up being blank. Only use submitChanges after the subcategory has been changed.
			oEvent.getSource().setValueState(ValueState.None);
			this._setCategoryFilter(this._oView.getBindingContext());
		},

		onInputChange: function(oEvent) {
			// Whenever the value of an input field is changed, the system must
			// update the product draft. For most of the fields, no specific
			// processing is required on the update of the product draft. onInputChange is the
			// change event defined in the XML view for such fields.
			var oField = oEvent.getSource();
			// Workaround to ensure that both the supplier Id and Name are updated in the model before the
			// draft is updated, otherwise only the Supplier Name is saved to the draft and Supplier Id is lost
			setTimeout(function() {
				this._fieldChange(oField);
			}.bind(this), 0);
		},

		onSubcategoryChange: function(oEvent) {
			var sValue = this._oSubcategory.getValue();
			if (!sValue.trim()) {
				return;
			}
			if (this._oCategory) {
				this._oCategory.setValueState(ValueState.None);
				var oSelectedItem = oEvent.getParameter("selectedItem"),
					oBindingContext = oSelectedItem.getBindingContext(),
					sMainCategory = oBindingContext.getProperty("MainCategoryId");
				if (sMainCategory !== this._oCategory.getValue()) {
					this._oCategory.setValue(sMainCategory);
				}
			}
			this._fieldChange(this._oSubcategory);
		},

		onSelectChange: function() {
			// Collect input controls.
			// Additional method for change event on SelectChanges because there is currently
			// no value status for a select field.
			this._setDirty();
			this._oHelper.saveSelectProductDraft();
		},

		// This method has been defined in the XML view and is required by UI5 to call
		// the Suggestions "type ahead" function
		suggestMethod: function(oEvent) {
			sap.m.InputODataSuggestProvider.suggest(oEvent);
		},

		// Values states if set are not automatically removed from the view.  For example, if there
		// are missing mandatory fields and the user presses "save", these fields are set to value state
		// error.  If the user then presses "cancel" and selects another product to edit, the values states
		// must be removed, otherwise the value states appear on the next product edit.
		_resetValueStates: function() {
			jQuery.each(this._aInputFields, function(i, input) {
				input.setValueState(ValueState.None);
			});
		},

		_fieldWithErrorState: function() {
			return this._aInputFields.some(function(input) {
				return (input.getValueState() === ValueState.Error);
			});
		},

		_fieldChange: function(oControl) {
			// Handler for a changed field that needs to be written to the draft.  This allows
			// specific processing for the "Change" event on the input fields, such as for numbers
			// to set empty to "0".
			this._setDirty();
			// Removes previous error state
			oControl.setValueState(ValueState.None);
			// Callback function in the event that saving draft is unsuccessful
			var fnSubmitDraftSuccess = function(sMessage) {
				if (sMessage && oControl) {
					oControl.setValueState("Error");
					oControl.setValueStateText(sMessage);
				}
			};
			this._oHelper.saveProductDraft(fnSubmitDraftSuccess);
		},

		// Set the empty mandatory fields to Value State Error
		// Return whether at least one mandatory field is still empty
		_checkAndMarkEmptyMandatoryFields: function() {
			var bErrors = false;
			// Check that inputs are not empty or space.
			// This does not happen during data binding because this is only triggered by changes.
			// Note that this loop must not stop with the first found error, since for all mandatory fields the value state must be updated.
			jQuery.each(this._aMandatoryFields, function(i, input) {
				if (!input.getValue() || input.getValue().trim() === "") {
					bErrors = true;
					input.setValueState(ValueState.Error);
				}
			});
			return bErrors;
		},

		_setCategoryFilter: function(oBindingContext) {
			if (this._oSubcategory) {
				var sMainCatgId = oBindingContext.getProperty("MainCategoryId"),
				sSubCatgId = oBindingContext.getProperty("SubCategoryId"),
					aFilters = sMainCatgId ? [new Filter("MainCategoryName", FilterOperator.StartsWith, sMainCatgId)] : [],
					oBinding = this._oSubcategory.getBinding("items");
				if (sMainCatgId) {
					oBinding.attachEventOnce("change", function() {
						var aBindings = oBinding.getContexts(),
							bIsValueValid = aBindings.some(function(oEntry) {
								return sSubCatgId === oEntry.getProperty("Id");
							}).bind(this);
						if (!bIsValueValid) {
							this._oSubcategory.setValue(" ");
						}
					}, this);
				} else {
					this._oSubcategory.setValue(" ");
				}
				oBinding.filter(aFilters, FilterType.Application);
			}
		},

		_setDirty: function() {
			this._oApplicationProperties.setProperty("/isDirty", true);
		}
	});
});