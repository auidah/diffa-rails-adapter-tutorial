class FixNullsInTradesView < ActiveRecord::Migration
  def up
    common = [
      'id',
      'ttype',
      'quantity',
      'expiry',
      'price',
      'direction',
      'entered_at']
    projection = common.dup.append('version').append('user').append('lastUpdated')
    cols = common.dup.append('md5(concat(%s))' % common.map { |col| "coalesce(%s, '')" % [col]}.join(',')).append('user_id').append('updated_at')
    execute 'alter view trades_view (%s) as (select %s from trades)' % [
      projection.join(','),  cols.join(',')
    ]
  end
end