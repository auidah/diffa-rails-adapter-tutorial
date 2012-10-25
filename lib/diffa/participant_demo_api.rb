require 'sinatra/base'

module Diffa
  class ParticipantDemoAPI < Sinatra::Base

    set :raise_errors, true
    set :dump_errors, false
    set :show_exceptions, false

    def initialize(grid_store)
      super()
      @grid_store = grid_store
    end


    post '/grids' do
      data = JSON.parse(request.body.read)
      # TODO: Filtering
      grid_id = @grid_store.provision(:name => data['name'])
      status 202
      JSON.dump({:grid_url => "/grids/%d" % [grid_id]})
    end
  end
end