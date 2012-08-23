class Future < ActiveRecord::Base
  attr_accessible :quantity, :trade_id, :user_id, :trade_date, :lots, :entry_price, :quote, :year, :month

  validates :trade_id, uniqueness: { :scope => :user_id }, presence: true


  before_validation :assign_trade_id
  before_save :assign_version

  def assign_trade_id
    pp attributes: attributes
    return unless self.trade_id.nil? or trade_id == 0
    futures = self.class.arel_table
    q = futures.project(futures[:trade_id].maximum).
      where(futures[:user_id].eq(user_id)).
      group(futures[:user_id])
    last_id, = connection.execute(q.to_sql).first
    self.trade_id = (last_id || 0) + 1
    pp trade_id: trade_id, last_id: last_id
  end

  # TODO: Upstream versions?
  def assign_version
    self.version = Digest::MD5.hexdigest(self.version || '') if changed? and not version_changed?
  end

  def as_json(options = {})
    super(options).merge(attributes: {})
  end


  def self.create_or_update_from_trade(t)
    instrument = find_by_trade_id(t.id) || new
    
    instrument.update_attributes(trade_date: t.trade_date, lots: t.lots,
                                 entry_price: t.entry_price, quote: t.quote,
                                 year: t.year, month: t.month)

    instrument.trade_id = t.id
    instrument.version = t.version
    instrument.user_id = t.user
    instrument.version = t.version

    instrument.save!
  end

end
