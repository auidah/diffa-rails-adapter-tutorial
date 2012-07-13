require 'rspec'

require 'capybara/rspec'
require 'capybara/poltergeist'

require 'diffa/participantdemo'

require_relative 'app_driver'

Capybara.javascript_driver = :poltergeist

describe "Application skeleton", :js => true do
  let (:app) { Diffa::ParticipantDemo.new }
  let (:driver) { Diffa::Test::AppDriver.new(app) }

  it "Can serve a page" do
    driver.show_grid
    driver.screenshot
  end


  it "shows sample data" do
    driver.show_grid
    driver.grid.should include(["sample-id0", "sample-version0"])
  end
end
