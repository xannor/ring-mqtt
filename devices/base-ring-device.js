const debug = require('debug')('ring-mqtt')
const utils = require('../lib/utils')

class RingDevice {
    // This function loops through each entity of the device, generates
    // a unique device ID for each one and creates the state/command topics.
    // Finally it generates a Home Assistant MQTT discovery message for the entity
    // and publishes this message to the config topic
    async publishDevice() {
        Object.keys(this.entities).forEach(entityName => {
            const entity = this.entities[entityName]
            const entityTopic = `${this.deviceTopic}/${entityName}`

            // Due to legacy reasons, devices with a single entity, as well as the alarm control panel
            // entity, use the device ID without a suffix as the unique ID.  All other devices append
            // the entityName as suffix to create a unique ID.
            const entityId = (Object.keys(this.entities).length > 1 && entity.type !== 'alarm_control_panel')
                ? `${this.deviceId}_${entityName}`
                : this.deviceId
            
            // Use a custom name suffix if provided, otherwise add entityName if device has more than one entity
            const deviceName = entity.hasOwnProperty('suffix')
                ?  `${this.deviceData.name} ${entity.suffix}`
                : Object.keys(this.entities).length > 1
                    ? `${this.deviceData.name} ${entityName.replace(/_/g," ").replace(/(^\w{1})|(\s+\w{1})/g, letter => letter.toUpperCase())}`
                    : `${this.deviceData.name}`

            // Set (mostly) universal values
            let discoveryMessage = {
                name: deviceName,
                unique_id: entityId,
                state_topic: `${entityTopic}/state`,
                availability_topic: this.availabilityTopic,
                payload_available: 'online',
                payload_not_available: 'offline',
                device: this.deviceData
            }

            switch (entity.type) {
                case 'switch':
                    discoveryMessage = {
                        ...discoveryMessage,
                        command_topic: `${entityTopic}/command`
                    }
                    break;
                case 'sensor':
                    discoveryMessage = {
                        ...discoveryMessage,
                        json_attributes_topic: `${entityTopic}/state`,
                        ...entity.hasOwnPoperty('valueTemplate') ? { value_template: entity.valueTemplate } : {},
                        ...entity.hasOwnPoperty('unitOfMeasure') ? { unit_of_measurement: entity.unitOfMeasurement } : {},
                        ...entity.hasOwnPoperty('icon') ? { icon: entity.icon } : { icon: 'mdi:information-outline' }
                    }
                    break;
                case 'number':
                    discoveryMessage = {
                        ...discoveryMessage,
                        command_topic: `${entityTopic}/command`,
                        ...entity.hasOwnPoperty('min') ? { min: entity.min } : {},
                        ...entity.hasOwnPoperty('max') ? { max: entity.max } : {},
                        ...entity.hasOwnPoperty('icon') ? { icon: entity.icon } : {}
                    }
                    break;
            }

            // On first discovery save the generated state/command topics to
            // entity properties and subscribe to any command topics
            if (!this.entities[entityName].hasOwnProperty('stateTopic')) {
                this.entities[entityName].stateTopic = `${entityTopic}/state`
                if (discoveryMessage.hasOwnProperty('command_topic')) {
                    this.entities[entityName].commandTopic = discoveryMessage.command_topic
                    this.mqttClient.subscribe(this.entities[entityName].commandTopic)
                }
            }

            const configTopic = `homeassistant/${this.entities[entity].type}/${this.locationId}/${entityId}/config`
            debug('HASS config topic: '+configTopic)
            debug(discoveryMessage)
            this.publishMqtt(configTopic, JSON.stringify(discoveryMessage))
        })
        // Sleep for a few seconds to give HA time to process discovery message
        await utils.sleep(2)
    }
}

module.exports = RingDevice