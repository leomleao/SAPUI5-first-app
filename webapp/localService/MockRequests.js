// In mock mode, the mock server intercepts HTTP calls and provides fake output to the
// client without involving a backend system. But special backend logic, such as that
// performed by function imports, is not automatically known to the mock server. To handle
// such cases, the app needs to define specific mock requests that simulate the backend
// logic using standard HTTP requests (that are again interpreted by the mock server) as
// shown below.

// The mock requests object caontains three attributes.
// method -     This is the http method (e.g. POST, PUT, DELETE,...) to which the mock request refers.
//              It is one of two criterions used by the mock server to decide if a request is handled
//              by a certain mock request object.
// path -       This is a regular expression that is matched against the url of the current request.
//              It is the second criterion used by the mock server to decide if a request is handled
//              by a certain mock request object. Please note that using the (.*) for the url parameter
//              section in the pattern causes the mock server to extract the url parameters from the
//              URL and provide them as separate import parameters to the handler function.
// response -   This is the handler function that is called when a http request matches the "method"
//              and "path" attributes of the mock request. A XML http request object (oXhr) for the
//              matched request is provided as an import parameter and optionally there can be import
//              parameters for url parameters
//              Please note that handler function needs to create the same response object as the
//              life service would.

sap.ui.define(["sap/ui/base/Object"], function(Object) {
	"use strict";

	return Object.extend("nw.epm.refapps.ext.prod.manage.localService.MockRequests", {
		constructor: function(oMockServer) {
			this._iLastId = 0;
			this._oMockServer = oMockServer;
			if (this._oMockServer.attachAfter) { // adapts to mock server new interface from UI5 1.30
				this._oMockServer.attachAfter("POST", this.onAfterDraftCreated.bind(this), "ProductDrafts");
			}
			this._oNewDraftDefaultValues = {
				CurrencyCode: "EUR",
				DimensionUnit: "MTR",
				IsDirty: false,
				IsNewProduct: true,
				QuantityUnit: "EA",
				MeasureUnit: "each",
				WeightUnit: "KGM"
			};
		},

		getRequests: function() {
			// This method is called by the webIDE if the app is started in mock mode with the
			// option "AddCusom Mock Requests". It returns the list of app specific mock requests.
			// The list is added to the mock server's own list of requests
			return (this._oMockServer.attachAfter) ? [ // adapts to mock server new interface from UI5 1.30
				this._mockActivateProduct(),
				this._mockEditProduct(),
				this._mockCopyProduct()
			] : [
				this._mockActivateProduct(),
				this._mockAddProduct(),
				this._mockEditProduct(),
				this._mockCopyProduct()
			];
		},

		_mockAddProduct: function() {
			return {
				// This mock request is called when a new draft is created. Drafts created by clicking 'Add'
				// do not contain all necessary data. The missing data is added by this function
				method: "POST",
				path: new RegExp("ProductDrafts"),
				response: function(oXhr) {
					//Get the just created draft from the Xhr response
					var oDraft = this._textToJsonObject(oXhr.responseText).d;
					// the pattern matches when a draft is created with "Add" and with "Edit"
					if (!oDraft.ProductId) {
						//Adds default values to the new draft created with "Add"
						this._updateProductDraft(oDraft.Id, this._oNewDraftDefaultValues);
					}
				}.bind(this)
			};
		},

		onAfterDraftCreated: function(oEvt) {
			if (!oEvt.getParameters().oEntity.ProductId) {
				//Adds default values to the new draft object
				jQuery.extend(oEvt.getParameters().oEntity, this._oNewDraftDefaultValues);
			}
		},

		_mockEditProduct: function() {
			return {
				// This mock request simulates the function import "EditProduct", which is triggered when the user chooses the
				// "Edit" button.
				method: "POST",
				path: new RegExp("EditProduct\\?ProductId='(.*)'"),
				response: function(oXhr, sProductId) {
					/* eslint-disable */
					alert("Limitation: The upload control is not supported in demo mode with mock data.");
					/* eslint-enable */
					this._createDraft(oXhr, decodeURIComponent(sProductId), false);
				}.bind(this)
			};
		},

		_mockCopyProduct: function() {
			return {
				// This mock request simulates the function import "CopyProduct", which is triggered when the user chooses the
				// "Copy" button.
				method: "POST",
				path: new RegExp("CopyProduct\\?ProductId='(.*)'"),
				response: function(oXhr, sProductId) {
					/* eslint-disable */
					alert("Limitation: The upload control is not supported in demo mode with mock data.");
					/* eslint-enable */
					this._createDraft(oXhr, decodeURIComponent(sProductId), true);
				}.bind(this)
			};
		},

		_mockActivateProduct: function() {
			return {
				// This mock request simulates the function import "ActivateProduct", which is triggered when the user chooses
				// the "Save" button.
				// Here the draft's data is used to update an existing product (if the draft was created by editing a product)
				// or the draft is used to created a new product (if the draft was created by copying a product)
				method: "POST",
				path: new RegExp("ActivateProduct\\?ProductDraftId='(.*)'"),
				response: function(oXhr, sDraftIdInUrl) {
					var oProdDraft = this._getProductDraft(decodeURIComponent(sDraftIdInUrl)),
						bIsNewProduct = oProdDraft.IsNewProduct,
						oProduct = {};

					// create/update the product
					oProduct = this._buildProductFromDraft(oProdDraft);
					if (bIsNewProduct || typeof bIsNewProduct === "undefined") {
						this._createProduct(oProduct);
					} else {
						this._updateProduct(oProduct.Id, oProduct);
					}

					oXhr.respondJSON(200, {}, JSON.stringify({
						//Gets the changed/created product in order to get the correct metadata for the response data object.
						d: this._getProduct(oProduct.Id)
					}));
				}.bind(this)
			};
		},

		_buildProductFromDraft: function(oDraft) {
			// create a product object based on a draft
			var oProduct = oDraft,
				bIsNewProduct = false;

			//store the information if it is a new product for later
			bIsNewProduct = oDraft.IsNewProduct;
			// bIsNewProduct is 'undefined' if the draft was created with the "+" button of the master list
			if (typeof bIsNewProduct === "undefined") {
				bIsNewProduct = true;
			}
			delete oProduct.__metadata;
			//remove the draft specific fields from the product
			delete oProduct.SubCategoryName;
			delete oProduct.MainCategoryName;
			delete oProduct.Images;
			delete oProduct.IsNewProduct;
			delete oProduct.ExpiresAt;
			delete oProduct.ProductId;
			delete oProduct.IsDirty;

			//delete draft - it is not needed anymore when the product is created/updated
			this._deleteProductDraft(oDraft.Id);

			// if a new product is created using the "Add" button on the S2 screen then the category names are not yeet known
			if (!oProduct.SubCategoryName) {
				oProduct.SubCategoryName = this._getSubCategory(oProduct.SubCategoryId).Name;
			}
			if (!oProduct.MainCategoryName) {
				oProduct.MainCategoryName = this._getMainCategory(oProduct.MainCategoryId).Name;
			}

			// Converts WeightUnit/DimensionUnit between product and product draft
			oProduct.WeightUnit = this._getWeightText(oDraft.WeightUnit);
			oProduct.DimensionUnit = this._getDimensionText(oDraft.DimensionUnit);

			if (bIsNewProduct) {
				oProduct.RatingCount = 0;
				oProduct.AverageRating = 0;
				oProduct.StockQuantity = 0;
				if (!oProduct.ImageUrl) {
					oProduct.ImageUrl = "";
				}
			}
			return oProduct;
		},

		_getNewId: function() {
			this._iLastId++;
			return this._iLastId;
		},

		_createDraft: function(oXhr, sProductId, bNewProduct) {
			var oProduct = this._getProduct(sProductId),
				oDraft = {};

			// Writes the product data to the draft
			// Most of the values for the draft can be copied from the product
			jQuery.extend(oDraft, oProduct);
			// Delete the product's properties that are not contained in the draft
			delete oDraft.HasReviewOfCurrentUser;
			delete oDraft.RatingCount;
			delete oDraft.IsFavoriteOfCurrentUser;
			delete oDraft.StockQuantity;
			delete oDraft.AverageRating;
			delete oDraft.__metadata;

			// oDraft.CreatedAt = new Date();
			oDraft.CreatedBy = "Test User";
			// oDraft.ExpiresAt = new Date(oDraft.CreatedAt.getTime() + 1800000);
			oDraft.IsNewProduct = bNewProduct;
			oDraft.IsDirty = false;
			if (bNewProduct) {
				// A new product is created as a copy of an existing one
				oDraft.Id = "EPM-" + this._getNewId();
				oDraft.ProductId = oDraft.Id;
			} else {
				// A product is edited
				oDraft.Id = sProductId;
				oDraft.ProductId = sProductId;
			}
			// Converts WeightUnit/DimensionUnit between product and product draft
			oDraft.WeightUnit = this._getWeightUnit(oProduct.WeightUnit);
			oDraft.DimensionUnit = this._getDimensionUnit(oProduct.DimensionUnit);

			//Creates draft
			this._createProductDraft(oDraft);

			oXhr.respondJSON(200, {}, JSON.stringify({
				//Reads the just created draft again in order to get the correct draft structure (including metadata) for the response.
				d: this._getProductDraft(oDraft.Id)
			}));
		},

		_textToJsonObject: function(sObject) {
			// the Xhr objects contains contains JSon objects enceoded as text (e.g. responseBodytext)
			//  this functions converts such texts to JSon objects
			var oXhrModel = new sap.ui.model.json.JSONModel();
			oXhrModel.setJSON(sObject);
			return oXhrModel.getData();
		},

		_createProduct: function(oProduct) {
			var aProducts = this._oMockServer.getEntitySetData("Products");
			oProduct = this._extendMetadata(oProduct, "Product", "Products");
			aProducts.push(oProduct);
			this._oMockServer.setEntitySetData("Products", aProducts);
		},

		_createProductDraft: function(oDraft) {
			var aProductDrafts = this._oMockServer.getEntitySetData("ProductDrafts");
			oDraft.Images = {
				__deferred: {
					uri: this._oMockServer.getRootUri() + "ProductDrafts('" + oDraft.Id + "')/Images"
				}
			};
			oDraft = this._extendMetadata(oDraft, "ProductDraft", "ProductDrafts");
			aProductDrafts.push(oDraft);
			this._oMockServer.setEntitySetData("ProductDrafts", aProductDrafts);
		},

		_extendMetadata: function(oEntity, sEntityTypeName, sEntitySetName) {
			oEntity.__metadata = {
				id: this._oMockServer.getRootUri() + sEntitySetName + "('" + oEntity.Id + "')",
				type: "EPM_REF_APPS_PROD_MAN_SRV." + sEntityTypeName,
				uri: this._oMockServer.getRootUri() + sEntitySetName + "('" + oEntity.Id + "')"
			};
			return oEntity;
		},

		_updateProduct: function(sId, oUpdatedProperties) {
			this._updateEntity("Products", sId, oUpdatedProperties);
		},

		_updateProductDraft: function(sDraftId, oUpdatedProperties) {
			this._updateEntity("ProductDrafts", sDraftId, oUpdatedProperties);
		},

		_updateEntity: function(sEntitySetName, sId, oUpdatedProperties) {
			var aEntities = this._oMockServer.getEntitySetData(sEntitySetName),
				updateEntity = function(oEntity) {
					if (oEntity.Id === sId) {
						jQuery.extend(oEntity, oUpdatedProperties);
					}
					return oEntity;
				},
				aUpdatedEntities = aEntities.map(updateEntity);
			this._oMockServer.setEntitySetData(sEntitySetName, aUpdatedEntities);
		},

		_deleteProductDraft: function(sDraftId) {
			var aProductDrafts = this._oMockServer.getEntitySetData("ProductDrafts"),
				filterProductDraft = function(oDraft) {
					return oDraft.Id !== sDraftId;
				};
			aProductDrafts = aProductDrafts.filter(filterProductDraft);
			this._oMockServer.setEntitySetData("ProductDrafts", aProductDrafts);
		},

		_getProduct: function(sProductId) {
			return this._getFirstFoundEntity("Products", sProductId);
		},

		_getProductDraft: function(sDraftId) {
			return this._getFirstFoundEntity("ProductDrafts", sDraftId);
		},

		_getMainCategory: function(sMainCategoryId) {
			return this._getFirstFoundEntity("MainCategories", sMainCategoryId);
		},

		_getSubCategory: function(sSubCategoryId) {
			return this._getFirstFoundEntity("SubCategories", sSubCategoryId);
		},

		_getDimensionText: function(sDimensionUnit) {
			return this._getFirstFoundEntity("DimensionUnits", sDimensionUnit, "Unit").Shorttext;
		},

		_getDimensionUnit: function(sDimensionText) {
			return this._getFirstFoundEntity("DimensionUnits", sDimensionText, "Shorttext").Unit;
		},

		_getWeightText: function(sWeightUnit) {
			return this._getFirstFoundEntity("WeightUnits", sWeightUnit, "Unit").Shorttext;
		},

		_getWeightUnit: function(sWeightText) {
			return this._getFirstFoundEntity("WeightUnits", sWeightText, "Shorttext").Unit;
		},

		_getFirstFoundEntity: function(sEntitySetName, sId, sKeyName) {
			var aEntities = this._oMockServer.getEntitySetData(sEntitySetName);
			var aFound = jQuery.grep(aEntities, function(oFound) {
				return oFound[sKeyName ? sKeyName : "Id"] === sId;
			});
			return aFound.length > 0 && aFound[0];
		}
	});
});