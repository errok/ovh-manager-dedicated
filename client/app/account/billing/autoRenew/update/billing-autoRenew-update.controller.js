/**
 *  @typedef ServiceType
 *  @type {object}
 *  @property {string} name
 *  @property {object[]} services The services given in input of this type
 *  @property {boolean} allowsRenewalChange True if this type of service allows changing the type of renewal for its services
 */
angular
    .module("Billing.controllers")
    .controller("billingAutoRenewUpdateCtrl", class $ctrl {
        constructor ($filter, $q, $state, $translate, Alerter, BillingAutoRenew, billingRenewHelper, UserContractService) {
            this.$filter = $filter;
            this.$q = $q;
            this.$state = $state;
            this.$translate = $translate;

            this.Alerter = Alerter;
            this.BillingAutoRenew = BillingAutoRenew;
            this.billingRenewHelper = billingRenewHelper;
            this.UserContractService = UserContractService;
        }

        $onInit () {
            if (_(this.servicesToChangeRenewalOf).isEmpty()) {
                return this.$state
                    .go("^")
                    .then(() => this.Alerter.set("alert-danger", this.$translate.instant("billing_autoRenew_update_error_emptyArguments")));
            }

            /** @type {?ServiceType[]} */
            this.serviceTypes = this.convertServicesToServiceTypes(this.servicesToChangeRenewalOf);

            this.contractsToSign = [];

            return this.$q.when();
        }

        convertServicesToServiceTypes (services) {
            if (!_(services).isArray()) {
                throw new TypeError(`[billingAutoRenewUpdateCtrl.convertServicesToServiceTypes] Argument services (${services}) is not an array`);
            }

            return services.reduce((previousValues, currentService) => {
                const searchResult = $ctrl.searchIfArrayContainsItem(previousValues, { name: currentService.serviceType });

                if (searchResult.wasSuccessful) {
                    const alreadyExistingServiceType = searchResult.item.value;
                    const updatedServiceType = this.pushServiceIntoServiceType(currentService, alreadyExistingServiceType);

                    return $ctrl.replaceServiceTypeInServiceTypes({ serviceTypes: previousValues, serviceTypeToReplace: alreadyExistingServiceType, replacingServiceType: updatedServiceType });
                }

                const newServiceType = $ctrl.createServiceType({ name: currentService.serviceType });
                const updatedServiceType = this.pushServiceIntoServiceType(currentService, newServiceType);

                return [...previousValues, updatedServiceType];
            }, []);
        }

        static searchIfArrayContainsItem (array, item) {
            const index = _(array).findIndex((arrayItem) => arrayItem.name === item.name);
            const searchWasSuccessful = index !== -1;

            return {
                wasSuccessful: searchWasSuccessful,
                item: searchWasSuccessful ?
                    {
                        value: _(array[index]).clone(true),
                        index
                    } :
                    null
            };
        }

        pushServiceIntoServiceType (service, serviceType) {
            $ctrl.testIsServiceTypeValid(serviceType);

            const services = [...serviceType.services, service];
            return this.updateServicesForServiceTypes(services, serviceType);
        }

        deleteServiceFromServiceType (service, serviceType) {
            $ctrl.testIsServiceTypeValid(serviceType);

            const services = serviceType.services.filter((currentService) => currentService.serviceId !== service.serviceId);
            return _(services).isEmpty() ? null : this.updateServicesForServiceTypes(services, serviceType);
        }

        updateServicesForServiceTypes (services, serviceType) {
            const possibleRenewPeriods = services.reduce((previousValues, service) => _(previousValues).isEmpty() ? service.possibleRenewPeriod : _(previousValues).intersection(service.possibleRenewPeriod).value(), []);
            const defaultManualRenewalType = {
                displayValue: this.$translate.instant("autorenew_service_renew_manuel"),
                value: "MANUAL",
                isAutomatic: false
            };
            const availableRenewalTypes = [defaultManualRenewalType, ...possibleRenewPeriods.map((availableRenewalType) => ({
                displayValue: this.$translate.instant(this.$filter("renewFrequence")(availableRenewalType)),
                value: availableRenewalType,
                isAutomatic: true
            }))];

            const allowRenewalChange = services.every((service) => $ctrl.doesServiceAllowsRenewalChange(service));
            const propertiesToUpdate = { services, allowRenewalChange, availableRenewalTypes, possibleRenewPeriods };

            return $ctrl.updateServiceTypeProperties(serviceType, propertiesToUpdate);
        }

        static testIsServiceTypeValid (serviceType) {
            const inputServiceTypeHasNameProperty = !_(serviceType).chain()
                .get("name")
                .isEmpty()
                .value();

            if (!inputServiceTypeHasNameProperty) {
                throw new Error(`[billingAutoRenewUpdateCtrl] input serviceType (${serviceType}) requires a name property`);
            }
        }

        static updateServiceTypeProperties (serviceType, properties) {
            return _(serviceType).chain()
                .clone(true)
                .assign(properties)
                .value();
        }

        static replaceServiceTypeInServiceTypes ({ serviceTypes, serviceTypeToReplace, replacingServiceType }) {
            const searchResult = $ctrl.searchIfArrayContainsItem(serviceTypes, { name: serviceTypeToReplace.name });

            if (!searchResult.wasSuccessful) {
                throw new Error(`[billingAutoRenewUpdateCtrl.buildNewServiceTypeArrayWithUpdatedServiceType] Can't find input serviceTypeToReplace ${serviceTypeToReplace} in input serviceTypes ${serviceTypes}`);
            }

            const serviceTypesClone = serviceTypes.slice();
            serviceTypesClone[searchResult.item.index] = replacingServiceType;
            return serviceTypesClone;
        }

        static createServiceType ({ name }) {
            if (!_(name).isString()) {
                throw new TypeError(`[billingAutoRenewUpdateCtrl.newServiceType] Argument name (${name}) is not a string`);
            }

            return {
                name,
                services: []
            };
        }

        static doesServiceAllowsRenewalChange (service) {
            if (!_(service.possibleRenewPeriod).isArray()) {
                throw new TypeError(`[billingAutoRenewUpdateCtrl.doesServiceAllowsRenewalChange]: input service.possibleRenewPeriod ${service.possibleRenewPeriod} should be an Array`);
            }

            const canBeRenewed = !service.renew.forced && !_(service.possibleRenewPeriod).isEmpty();
            const onlyManualRenewalIsAllowed = _(service.possibleRenewPeriod).last() === 0;

            return canBeRenewed && !onlyManualRenewalIsAllowed;
        }

        fetchContractsToSign () {
            if (this.promiseToFetchContractsToSign === undefined) {
                this.isFetchingContractsToSign = true;

                this.promiseToFetchContractsToSign = this.UserContractService
                    .getAgreementsToValidate((contract) => this.AutoRenew.getAutorenewContractIds().includes(contract.contractId))
                    .then((agreementsToValidate) => {
                        this.contractsToSign = agreementsToValidate.map((contract) => ({
                            name: contract.code,
                            url: contract.pdf,
                            id: contract.id
                        }));

                        if (_(this.contractsToSign).isEmpty()) {
                            this.contractsAreSigned = true;
                        }
                    })
                    .catch(() => {
                        this.Alerter.set("alert-danger", this.$translate.instant("autorenew_service_update_step2_error"));
                    })
                    .finally(() => {
                        this.isFetchingContractsToSign = false;
                    });
            }

            return this.promiseToFetchContractsToSign;
        }

        onClickOnServiceChipCloseButton (service, serviceType) {
            const updatedServiceType = this.deleteServiceFromServiceType(service, serviceType);

            if (updatedServiceType === null) {
                this.serviceTypes = this.serviceTypes.filter((currentServiceType) => currentServiceType.name !== serviceType.name);
            } else {
                this.serviceTypes = $ctrl.replaceServiceTypeInServiceTypes({ serviceTypes: this.serviceTypes, serviceTypeToReplace: serviceType, replacingServiceType: updatedServiceType });
            }
        }

        updateConfirmationButtonAvailability () {
            this.confirmationButtonIsAvailable = _(this.serviceTypes).find((serviceType) => serviceType.selectedRenewalType) !== undefined;
            this.userMustSignContracts = _(this.serviceTypes).find((serviceType) => _(serviceType.selectedRenewalType).get("isAutomatic", false)) !== undefined;

            return this.userMustSignContracts ? this.fetchContractsToSign() : this.$q.when();
        }

        sendRenewals () {
            this.isSendingRenewal = true;

            const servicesToSend = [].concat(...this.serviceTypes
                .filter((serviceType) => serviceType.selectedRenewalType)
                .map((serviceType) => serviceType.services.map((service) => {
                    const renewalIsAutomatic = serviceType.selectedRenewalType.isAutomatic;
                    const renewalPeriod = renewalIsAutomatic ? serviceType.selectedRenewalType.value : null;

                    const propertiesToUpdate = service.renewalType === "automaticV2016" ?
                        {
                            period: renewalPeriod,
                            manualPayment: !renewalIsAutomatic
                        } :
                        {
                            period: renewalPeriod,
                            automatic: renewalIsAutomatic
                        };

                    const serviceHasSubProducts = !_(service.subProducts).isEmpty();
                    if (serviceHasSubProducts) {
                        return service.subProducts.map((subService) => ({
                            serviceId: subService.serviceId,
                            serviceType: serviceType.name,
                            renew: _(subService.renew)
                                .chain()
                                .clone(true)
                                .assign(propertiesToUpdate)
                                .value()
                        }));
                    }

                    return {
                        serviceId: service.serviceId,
                        serviceType: serviceType.name,
                        renew: _(service.renew)
                            .chain()
                            .clone(true)
                            .assign(propertiesToUpdate)
                            .value()
                    };
                })));

            return this.UserContractService
                .acceptAgreements(this.contractsToSign)
                .then(() => this.BillingAutoRenew.updateServices(servicesToSend))
                .then(() => this.BillingAutoRenew.getAutorenew())
                .then(({ active, renewDay }) =>
                    active ?
                        this.$q.when() :
                        this.BillingAutoRenew.putAutorenew({
                            active: true,
                            renewDay: renewDay > 0 && renewDay <= 30 ? renewDay : 1
                        })
                )
                .then(() => {
                    this.Alerter.set("alert-success", this.$translate.instant("autorenew_service_update_renewal_activation_notice"));
                })
                .catch((err) => {
                    this.Alerter.set("alert-danger", this.$translate.instant("autorenew_service_update_renewal_activation_error", {
                        t0: err
                    }));
                })
                .finally(() => this.$state.go("^"));
        }
    });
